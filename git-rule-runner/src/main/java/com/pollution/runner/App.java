package com.pollution.runner;

import com.google.gson.Gson;
import org.kie.api.KieServices;
import org.kie.api.builder.Message;
import org.kie.api.builder.Results;
import org.kie.api.io.ResourceType;
import org.kie.api.runtime.KieSession;
import org.kie.internal.utils.KieHelper;

import javax.tools.JavaCompiler;
import javax.tools.ToolProvider;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.PrintStream;
import java.lang.reflect.Method;
import java.net.URL;
import java.net.URLClassLoader;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.*;
import java.util.stream.Collectors;

import static spark.Spark.*;

public class App {
    private static final Gson gson = new Gson();

    private static final String REPO_PATH =
            System.getenv().getOrDefault("BC_REPO_PATH", "/workspace/pollution-rules");

    private static final String JAVA_SRC =
            REPO_PATH + "/src/main/java";

    private static final String DRL_SRC =
            REPO_PATH + "/src/main/resources";

    private static final String BUILD_BASE_DIR =
            "/tmp/git-rule-runner-classes";

    public static void main(String[] args) {
        port(Integer.parseInt(System.getenv().getOrDefault("PORT", "3020")));

        get("/health", (req, res) -> {
            res.type("application/json");
            return gson.toJson(Map.of(
                    "ok", true,
                    "repoPath", REPO_PATH,
                    "javaSrc", JAVA_SRC,
                    "drlSrc", DRL_SRC
            ));
        });

        post("/run", (req, res) -> {
            res.type("application/json");

            try {
                RunRequest runRequest = gson.fromJson(req.body(), RunRequest.class);
                RunResponse response = runRules(runRequest);
                return gson.toJson(response);
            } catch (Exception e) {
                res.status(500);
                return gson.toJson(Map.of(
                        "ok", false,
                        "error", String.valueOf(e),
                        "stack", Arrays.stream(e.getStackTrace())
                                .map(StackTraceElement::toString)
                                .limit(25)
                                .collect(Collectors.toList())
                ));
            }
        });
    }

    private static RunResponse runRules(RunRequest request) throws Exception {
        String buildDir = BUILD_BASE_DIR + "-" + System.currentTimeMillis();

        compileDataObjects(buildDir);

        URLClassLoader classLoader = new URLClassLoader(
                new URL[]{new File(buildDir).toURI().toURL()},
                App.class.getClassLoader()
        );
        Thread.currentThread().setContextClassLoader(classLoader);
        KieHelper helper = new KieHelper();

        List<Path> drlFiles = Files.walk(Paths.get(DRL_SRC))
                .filter(path -> path.toString().endsWith(".drl"))
                .collect(Collectors.toList());

        for (Path drl : drlFiles) {
            helper.addResource(
                    KieServices.Factory.get()
                            .getResources()
                            .newFileSystemResource(drl.toFile()),
                    ResourceType.DRL
            );
        }

        Results results = helper.verify();

        if (results.hasMessages(Message.Level.ERROR)) {
            return RunResponse.failed(
                    "DRL compilation failed",
                    results.getMessages().stream()
                            .map(Object::toString)
                            .collect(Collectors.toList())
            );
        }

        KieSession session = helper.build().newKieSession();

        List<Object> insertedFacts = new ArrayList<>();

        if (request != null && request.facts != null) {
            for (FactInput fact : request.facts) {
                Object factObject = createFact(classLoader, fact);
                insertedFacts.add(factObject);
                session.insert(factObject);
            }
        }

        int fired = session.fireAllRules();

        List<Object> objects = new ArrayList<>();
        session.getObjects().forEach(objects::add);

        session.dispose();

        RunResponse response = new RunResponse();
        response.ok = true;
        response.rulesFired = fired;
        response.insertedFacts = insertedFacts.stream()
            .map(App::toPlainObject)
            .collect(Collectors.toList());

        response.objects = objects.stream()
            .map(App::toPlainObject)
            .collect(Collectors.toList());
        response.drlFiles = drlFiles.stream()
            .map(Path::toString)
            .collect(Collectors.toList());

        return response;
    }
    private static Map<String, Object> toPlainObject(Object obj) {
        Map<String, Object> out = new LinkedHashMap<>();

        if (obj == null) {
            out.put("value", null);
            return out;
        }

        out.put("_class", obj.getClass().getName());

        for (Method method : obj.getClass().getMethods()) {
            String name = method.getName();

            if (!name.startsWith("get")) continue;
            if (name.equals("getClass")) continue;
            if (method.getParameterCount() != 0) continue;

            try {
                Object value = method.invoke(obj);
                String field = name.substring(3, 4).toLowerCase() + name.substring(4);
                out.put(field, value);
            } catch (Exception ignored) {
            }
        }

        return out;
    }
    private static void compileDataObjects(String buildDir) throws Exception {
        Files.createDirectories(Paths.get(buildDir));

        List<String> javaFiles = Files.walk(Paths.get(JAVA_SRC))
                .filter(path -> path.toString().endsWith(".java"))
                .map(Path::toString)
                .collect(Collectors.toList());

        if (javaFiles.isEmpty()) {
            throw new RuntimeException("No Java data object files found at " + JAVA_SRC);
        }

        JavaCompiler compiler = ToolProvider.getSystemJavaCompiler();

        if (compiler == null) {
            throw new RuntimeException("No Java compiler found. Use JDK image, not JRE.");
        }

        List<String> args = new ArrayList<>();
        args.add("-d");
        args.add(buildDir);
        args.add("-classpath");
        args.add(buildCompileClasspath());
        args.addAll(javaFiles);

        ByteArrayOutputStream compilerOut = new ByteArrayOutputStream();
        PrintStream compilerPrintStream = new PrintStream(compilerOut);

        int result = compiler.run(
                null,
                compilerPrintStream,
                compilerPrintStream,
                args.toArray(new String[0])
        );

        if (result != 0) {
            throw new RuntimeException(
                    "Java data object compilation failed with code "
                            + result
                            + "\n"
                            + compilerOut
            );
        }
    }

    private static String buildCompileClasspath() {
        String runtimeClasspath = System.getProperty("java.class.path");

        String kieApiJar = System.getProperty("user.home")
                + "/.m2/repository/org/kie/kie-api/7.61.0.Final/kie-api-7.61.0.Final.jar";

        return runtimeClasspath + File.pathSeparator + kieApiJar;
    }

    private static Object createFact(ClassLoader classLoader, FactInput fact) throws Exception {
        if (fact == null || fact.className == null || fact.className.trim().isEmpty()) {
            throw new RuntimeException("Fact className is required.");
        }

        Class<?> clazz = classLoader.loadClass(fact.className);
        Object instance = clazz.getDeclaredConstructor().newInstance();

        if (fact.fields == null) {
            return instance;
        }

        for (Map.Entry<String, Object> entry : fact.fields.entrySet()) {
            String field = entry.getKey();
            Object value = entry.getValue();

            String setterName =
                    "set" + field.substring(0, 1).toUpperCase() + field.substring(1);

            Optional<Method> setter = Arrays.stream(clazz.getMethods())
                    .filter(method -> method.getName().equals(setterName))
                    .filter(method -> method.getParameterTypes().length == 1)
                    .findFirst();

            if (setter.isEmpty()) {
                throw new RuntimeException(
                        "No setter found for field \""
                                + field
                                + "\" on class "
                                + fact.className
                                + ". Expected method: "
                                + setterName
                );
            }

            Method method = setter.get();
            Class<?> paramType = method.getParameterTypes()[0];
            method.invoke(instance, convertValue(value, paramType));
        }

        return instance;
    }

    private static Object convertValue(Object value, Class<?> targetType) {
        if (value == null) return null;

        if (targetType.equals(String.class)) {
            return String.valueOf(value);
        }

        if (targetType.equals(Double.class) || targetType.equals(double.class)) {
            return ((Number) value).doubleValue();
        }

        if (targetType.equals(Integer.class) || targetType.equals(int.class)) {
            return ((Number) value).intValue();
        }

        if (targetType.equals(Boolean.class) || targetType.equals(boolean.class)) {
            return Boolean.valueOf(String.valueOf(value));
        }

        if (targetType.equals(java.util.Date.class)) {
            if (value instanceof Number) {
                return new java.util.Date(((Number) value).longValue());
            }

            return new java.util.Date();
        }

        return value;
    }

    static class RunRequest {
        List<FactInput> facts;
    }

    static class FactInput {
        String className;
        Map<String, Object> fields;
    }

    static class RunResponse {
        boolean ok;
        int rulesFired;
        Object insertedFacts;
        Object objects;
        Object drlFiles;
        Object errors;
        String error;

        static RunResponse failed(String error, Object errors) {
            RunResponse r = new RunResponse();
            r.ok = false;
            r.error = error;
            r.errors = errors;
            return r;
        }
    }
}