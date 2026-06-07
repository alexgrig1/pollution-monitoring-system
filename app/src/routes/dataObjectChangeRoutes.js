import express from "express";
import { execFile } from "child_process";
import fs from "fs";
import path from "path";

const router = express.Router();

const DOMAIN_PATH = "src/main/java/com/myspace/pollution/pollution_rules";

function getRepoPath() {
  return process.env.BC_REPO_PATH
    ? path.resolve(process.env.BC_REPO_PATH)
    : path.resolve(process.cwd(), "..", "pollution-rules");
}

function runGit(args, cwd = getRepoPath()) {
  return new Promise((resolve, reject) => {
    execFile("git", args, { cwd }, (error, stdout, stderr) => {
      if (error) return reject(new Error(stderr || error.message));
      resolve(stdout);
    });
  });
}

function sanitizeJavaIdentifier(value) {
  const text = String(value || "").trim();

  if (!/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(text)) {
    throw new Error(`Invalid Java identifier: ${value}`);
  }

  return text;
}

function normalizeJavaType(type) {
  const t = String(type || "").trim();

  const allowed = {
    String: "java.lang.String",
    Double: "java.lang.Double",
    Integer: "java.lang.Integer",
    Boolean: "java.lang.Boolean",
    Date: "java.util.Date",
  };

  if (!allowed[t]) {
    throw new Error(`Unsupported type: ${type}. Use String, Double, Integer, Boolean, or Date.`);
  }

  return allowed[t];
}

function capitalize(name) {
  return name.charAt(0).toUpperCase() + name.slice(1);
}

function fieldExists(source, fieldName) {
  const re = new RegExp(`private\\s+[\\w.$]+\\s+${fieldName}\\s*;`);
  return re.test(source);
}

function addFieldToJavaSource(source, objectName, fieldName, javaType) {
  if (fieldExists(source, fieldName)) {
    throw new Error(`Field "${fieldName}" already exists in ${objectName}.`);
  }

  const cap = capitalize(fieldName);

  const fieldBlock = `
        @org.kie.api.definition.type.Label(value = "${fieldName}")
        private ${javaType} ${fieldName};
`;

  const methodsBlock = `
        public ${javaType} get${cap}() {
                return this.${fieldName};
        }

        public void set${cap}(${javaType} ${fieldName}) {
                this.${fieldName} = ${fieldName};
        }

`;

  let updated = source;

  const noArgConstructor = new RegExp(`\\n\\s*public\\s+${objectName}\\s*\\(\\s*\\)\\s*\\{`);
  const noArgMatch = updated.match(noArgConstructor);

  if (noArgMatch?.index) {
    updated =
      updated.slice(0, noArgMatch.index) +
      fieldBlock +
      updated.slice(noArgMatch.index);
  } else {
    const classEnd = updated.lastIndexOf("}");
    updated = updated.slice(0, classEnd) + fieldBlock + updated.slice(classEnd);
  }

  const lastBrace = updated.lastIndexOf("}");
  updated = updated.slice(0, lastBrace) + methodsBlock + updated.slice(lastBrace);

  return updated;
}

router.post("/objects/:objectName/fields", async (req, res) => {
  try {
    const repoPath = getRepoPath();
    const objectName = sanitizeJavaIdentifier(req.params.objectName);
    const fieldName = sanitizeJavaIdentifier(req.body.fieldName);
    const javaType = normalizeJavaType(req.body.type);

    const objectPath = path.join(repoPath, DOMAIN_PATH, `${objectName}.java`);

    if (!fs.existsSync(objectPath)) {
      return res.status(404).json({
        ok: false,
        error: `Data Object file not found: ${objectPath}`,
      });
    }

    const before = fs.readFileSync(objectPath, "utf-8");
    const after = addFieldToJavaSource(before, objectName, fieldName, javaType);

    fs.writeFileSync(objectPath, after, "utf-8");

    await runGit(["add", `${DOMAIN_PATH}/${objectName}.java`]);
    await runGit([
      "commit",
      "-m",
      `Add ${fieldName} field to ${objectName} data object`,
    ]);

    let pushed = false;
    let pushError = null;

    try {
      await runGit(["push"]);
      pushed = true;
    } catch (e) {
      pushError = String(e);
    }

    res.json({
      ok: true,
      objectName,
      fieldName,
      type: javaType,
      committed: true,
      pushed,
      pushError,
      message:
        "Field added to Business Central Git repository. Run Build & Install in Business Central before deploying a new KIE container version.",
    });
  } catch (e) {
    res.status(500).json({
      ok: false,
      error: String(e),
    });
  }
});

export default router;