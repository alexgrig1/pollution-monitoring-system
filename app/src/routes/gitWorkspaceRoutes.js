import express from "express";
import fs from "fs";
import path from "path";
import { execFile } from "child_process";

const router = express.Router();

const REPO_PATH = process.env.BC_REPO_PATH || "/workspace/pollution-rules";

const DRL_DIR = "src/main/resources/com/myspace/pollution/pollution_rules";
const JAVA_DIR = "src/main/java/com/myspace/pollution/pollution_rules";

function runGit(args) {
    return new Promise((resolve, reject) => {
        execFile("git", args, { cwd: REPO_PATH }, (err, stdout, stderr) => {
            if (err) reject(new Error(stderr || err.message));
            else resolve(stdout);
        });
    });
}

function safeFileName(name) {
    if (!/^[a-zA-Z0-9_.-]+$/.test(name)) {
        throw new Error("Invalid file name");
    }
    return name;
}

function resolveRepoFile(type, fileName) {
    const safe = safeFileName(fileName);

    if (type === "drl") {
        if (!safe.endsWith(".drl")) throw new Error("DRL file must end with .drl");
        return {
            relativePath: `${DRL_DIR}/${safe}`,
            absolutePath: path.join(REPO_PATH, DRL_DIR, safe),
        };
    }

    if (type === "data-object") {
        if (!safe.endsWith(".java")) throw new Error("Data object file must end with .java");
        return {
            relativePath: `${JAVA_DIR}/${safe}`,
            absolutePath: path.join(REPO_PATH, JAVA_DIR, safe),
        };
    }

    throw new Error("Invalid type");
}

async function commitFile(relativePath, message) {
    await runGit(["add", relativePath]);

    const status = await runGit(["status", "--porcelain", "--", relativePath]);

    if (!status.trim()) {
        return {
            committed: false,
            message: "No changes to commit",
        };
    }

    await runGit(["commit", "-m", message]);

    const commit = (await runGit(["rev-parse", "--short", "HEAD"])).trim();

    return {
        committed: true,
        commit,
    };
}

router.get("/files", async (req, res) => {
    try {
        const drlPath = path.join(REPO_PATH, DRL_DIR);
        const javaPath = path.join(REPO_PATH, JAVA_DIR);

        const drlFiles = fs.existsSync(drlPath)
            ? fs.readdirSync(drlPath).filter((f) => f.endsWith(".drl"))
            : [];

        const dataObjects = fs.existsSync(javaPath)
            ? fs.readdirSync(javaPath).filter((f) => f.endsWith(".java"))
            : [];

        res.json({
            ok: true,
            repoPath: REPO_PATH,
            drlFiles,
            dataObjects,
        });
    } catch (e) {
        res.status(500).json({ ok: false, error: String(e) });
    }
});

router.get("/files/:type/:fileName/content", async (req, res) => {
    try {
        const { relativePath, absolutePath } = resolveRepoFile(
            req.params.type,
            req.params.fileName
        );

        if (!fs.existsSync(absolutePath)) {
            return res.status(404).json({ ok: false, error: "File not found" });
        }

        res.json({
            ok: true,
            type: req.params.type,
            fileName: req.params.fileName,
            relativePath,
            content: fs.readFileSync(absolutePath, "utf8"),
        });
    } catch (e) {
        res.status(500).json({ ok: false, error: String(e) });
    }
});

router.post("/files/:type/:fileName/deploy", async (req, res) => {
    try {
        const { relativePath, absolutePath } = resolveRepoFile(
            req.params.type,
            req.params.fileName
        );

        const content = String(req.body.content || "");
        const message =
            req.body.message ||
            `Deploy ${req.params.type} ${req.params.fileName}`;

        fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
        fs.writeFileSync(absolutePath, content, "utf8");

        const result = await commitFile(relativePath, message);

        res.json({
            ok: true,
            action: "DEPLOY_FILE",
            type: req.params.type,
            fileName: req.params.fileName,
            relativePath,
            ...result,
        });
    } catch (e) {
        res.status(500).json({ ok: false, error: String(e) });
    }
});

router.get("/files/:type/:fileName/versions", async (req, res) => {
    try {
        const { relativePath } = resolveRepoFile(req.params.type, req.params.fileName);

        const log = await runGit([
            "log",
            "--pretty=format:%h|%H|%s",
            "--",
            relativePath,
        ]);

        const rows = log
            .split("\n")
            .filter(Boolean)
            .map((line) => {
                const [shortCommit, commit, message] = line.split("|");
                return {
                    shortCommit,
                    commit,
                    message,
                };
            });

        const oldestFirst = [...rows].reverse();

        const versions = oldestFirst.map((row, index) => ({
            version: index + 1,
            ...row,
            current: index === oldestFirst.length - 1,
        }));
        res.json({
            ok: true,
            type: req.params.type,
            fileName: req.params.fileName,
            relativePath,
            count: versions.length,
            versions,
        });
    } catch (e) {
        res.status(500).json({ ok: false, error: String(e) });
    }
});

router.post("/files/:type/:fileName/revert", async (req, res) => {
    try {
        const { relativePath } = resolveRepoFile(req.params.type, req.params.fileName);

        const commit = String(req.body.commit || "").trim();

        if (!commit) {
            return res.status(400).json({
                ok: false,
                error: "commit is required",
            });
        }

        await runGit(["checkout", commit, "--", relativePath]);

        const result = await commitFile(
            relativePath,
            `Revert ${req.params.fileName} to ${commit}`
        );

        res.json({
            ok: true,
            action: "REVERT_FILE",
            type: req.params.type,
            fileName: req.params.fileName,
            revertedTo: commit,
            relativePath,
            ...result,
        });
    } catch (e) {
        res.status(500).json({ ok: false, error: String(e) });
    }
});

export default router;