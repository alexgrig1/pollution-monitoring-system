import express from "express";
import fs from "fs";
import path from "path";
import { execFile } from "child_process";

const router = express.Router();

const REPO_PATH = process.env.BC_REPO_PATH || "/workspace/pollution-rules";

const JAVA_DIR = "src/main/java/com/myspace/pollution/pollution_rules";
const DRL_DIR = "src/main/resources/com/myspace/pollution/pollution_rules";

function runGit(args) {
  return new Promise((resolve, reject) => {
    execFile("git", args, { cwd: REPO_PATH }, (err, stdout, stderr) => {
      if (err) reject(new Error(stderr || err.message));
      else resolve(stdout);
    });
  });
}

function simplifyJavaType(type) {
  return String(type)
    .replace("java.lang.", "")
    .replace("java.util.", "")
    .trim();
}

function extractSchemaFromJava(javaSource) {
  const schema = {};
  const regex = /private\s+([\w.$]+)\s+(\w+)\s*;/g;

  let match;
  while ((match = regex.exec(javaSource)) !== null) {
    schema[match[2]] = simplifyJavaType(match[1]);
  }

  return schema;
}

function extractRuleNames(drl) {
  return [...String(drl ?? "").matchAll(/rule\s+"([^"]+)"/gi)].map(
    (m) => m[1]
  );
}

function safeFileName(name) {
  if (!/^[a-zA-Z0-9_.-]+$/.test(name)) {
    throw new Error("Invalid file name");
  }

  return name;
}

router.get("/objects", async (req, res) => {
  try {
    const dir = path.join(REPO_PATH, JAVA_DIR);

    const objects = fs.existsSync(dir)
      ? fs
          .readdirSync(dir)
          .filter((file) => file.endsWith(".java"))
          .map((file) => file.replace(/\.java$/, ""))
      : [];

    res.json({
      ok: true,
      repoPath: REPO_PATH,
      count: objects.length,
      objects,
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

router.get("/objects/:objectName/versions", async (req, res) => {
  try {
    const objectName = safeFileName(req.params.objectName);
    const objectPath = `${JAVA_DIR}/${objectName}.java`;

    const logOutput = await runGit([
      "log",
      "--oneline",
      "--follow",
      "--",
      objectPath,
    ]);

    const commits = logOutput
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [commit, ...messageParts] = line.split(" ");
        return {
          commit,
          shortCommit: commit,
          message: messageParts.join(" "),
        };
      });

    const versions = [];

    for (let index = 0; index < commits.length; index++) {
      const item = commits[index];

      let source = "";
      let schema = {};

      try {
        source = await runGit(["show", `${item.commit}:${objectPath}`]);
        schema = extractSchemaFromJava(source);
      } catch {
        schema = {};
      }

      versions.push({
        version: commits.length - index,
        commit: item.commit,
        shortCommit: item.shortCommit,
        message: item.message,
        schema,
        fieldCount: Object.keys(schema).length,
        current: index === 0,
      });
    }

    res.json({
      ok: true,
      object: objectName,
      objectPath,
      count: versions.length,
      versions,
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

router.get("/rules", async (req, res) => {
  try {
    const dir = path.join(REPO_PATH, DRL_DIR);

    const rules = fs.existsSync(dir)
      ? fs.readdirSync(dir).filter((file) => file.endsWith(".drl"))
      : [];

    res.json({
      ok: true,
      repoPath: REPO_PATH,
      rulesPath: DRL_DIR,
      count: rules.length,
      rules,
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

router.get("/rules/:ruleFile/versions", async (req, res) => {
  try {
    const ruleFile = safeFileName(req.params.ruleFile);
    const rulePath = `${DRL_DIR}/${ruleFile}`;

    const logOutput = await runGit([
      "log",
      "--oneline",
      "--follow",
      "--",
      rulePath,
    ]);

    const newestFirst = logOutput
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [commit, ...messageParts] = line.split(" ");
        return {
          commit,
          shortCommit: commit,
          message: messageParts.join(" "),
        };
      });

    const oldestFirst = [...newestFirst].reverse();

    const versions = [];

    for (let index = 0; index < oldestFirst.length; index++) {
      const item = oldestFirst[index];

      let content = "";
      try {
        content = await runGit(["show", `${item.commit}:${rulePath}`]);
      } catch {
        content = "";
      }

      const rules = extractRuleNames(content);

      versions.push({
        version: index + 1,
        commit: item.commit,
        shortCommit: item.shortCommit,
        message: item.message,
        ruleCount: rules.length,
        rules,
        current: index === oldestFirst.length - 1,
      });
    }

    res.json({
      ok: true,
      ruleFile,
      rulePath,
      count: versions.length,
      versions,
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

router.get("/rules/:ruleFile/content/:commit", async (req, res) => {
  try {
    const ruleFile = safeFileName(req.params.ruleFile);
    const commit = String(req.params.commit || "").trim();
    const rulePath = `${DRL_DIR}/${ruleFile}`;

    const content = await runGit(["show", `${commit}:${rulePath}`]);

    res.json({
      ok: true,
      ruleFile,
      commit,
      rulePath,
      rules: extractRuleNames(content),
      content,
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

export default router;