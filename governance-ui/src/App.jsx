import { useEffect, useState } from "react";
import { AlertTriangle, Database, FileCode, GitCompare, Brain, Activity } from "lucide-react";

import "./App.css";

const API = "";

async function api(path) {
    const res = await fetch(`${API}${path}`);
    return res.json();
}

function JsonBlock({ data }) {
    return <pre className="code">{JSON.stringify(data, null, 2)}</pre>;
}

function App() {
    const [tab, setTab] = useState("objects");
    const [runtimeOverview, setRuntimeOverview] = useState(null);

    async function loadRuntimeOverview() {
        try {
            const data = await api("/api/runtime/overview");
            setRuntimeOverview(data);
        } catch {
            setRuntimeOverview({
                kieServerUp: false,
                containers: [],
            });
        }
    }

    useEffect(() => {
        loadRuntimeOverview();

        const timer = setInterval(loadRuntimeOverview, 10000);
        return () => clearInterval(timer);
    }, []);

    const kieServerUp = Boolean(runtimeOverview?.kieServerUp);
    const startedContainers =
        runtimeOverview?.containers?.filter((c) => c.status === "STARTED")?.length ?? 0;
    const totalContainers = runtimeOverview?.containers?.length ?? 0;
    return (
        <div className="app">
            <aside className="sidebar">
                <h2>Governance UI</h2>
                {/* <GlobalRuntimeStatus
                    kieServerUp={kieServerUp}
                    startedContainers={startedContainers}
                    totalContainers={totalContainers}
                /> */}
                <button onClick={() => setTab("objects")} className={tab === "objects" ? "active" : ""}>
                    <Database size={18} /> Data Objects
                </button>

                <button onClick={() => setTab("rules")} className={tab === "rules" ? "active" : ""}>
                    <FileCode size={18} /> DRL Rules
                </button>

                <button onClick={() => setTab("generator")} className={tab === "generator" ? "active" : ""}>
                    <Brain size={18} /> AI Rule Generator
                </button>
                {/* <button onClick={() => setTab("runtime")} className={tab === "runtime" ? "active" : ""}>
                    <Activity size={18} /> Runtime Control
                </button> */}
                <button
                    onClick={() => setTab("monitoring")}
                    className={tab === "monitoring" ? "active" : ""}
                >
                    <Activity size={18} />
                    Monitoring
                </button>
            </aside>

            <main className="main">
                {tab === "objects" && <DataObjects />}
                {tab === "rules" && <DrlRules />}
                {tab === "generator" && <RuleGenerator />}
                {tab === "runtime" && <RuntimeDashboard />}
                {tab === "monitoring" && <MonitoringDashboard />}
            </main>
        </div>
    );
}

function GlobalRuntimeStatus({ kieServerUp, startedContainers, totalContainers }) {
    const containerOk = startedContainers > 0;

    return (
        <div className="global-runtime-status">
            <div className="global-status-row">
                <span className={`global-dot ${kieServerUp ? "ok" : "bad"}`} />
                <span>KIE Server</span>
                <strong>{kieServerUp ? "UP" : "DOWN"}</strong>
            </div>

            <div className="global-status-row">
                <span className={`global-dot ${containerOk ? "ok" : "bad"}`} />
                <span>KIE Containers</span>
                <strong>{startedContainers}/{totalContainers}</strong>
            </div>
        </div>
    );
}

function DataObjects() {
    const [objects, setObjects] = useState([]);
    const [selected, setSelected] = useState("");
    const [versions, setVersions] = useState([]);
    const [selectedVersion, setSelectedVersion] = useState("");
    const [fieldName, setFieldName] = useState("");
    const [fieldType, setFieldType] = useState("Double");
    const [result, setResult] = useState(null);
    const [loading, setLoading] = useState(false);

    const version =
        versions.find((v) => v.commit === selectedVersion) || versions[0];

    const currentVersion = versions[0];
    const isCurrentVersion = selectedVersion === currentVersion?.commit;

    useEffect(() => {
        api("/api/model/objects").then((data) => {
            if (data.ok) {
                setObjects(data.objects || []);
                setSelected(data.objects?.[0] || "");
            }
        });
    }, []);

    useEffect(() => {
        if (!selected) return;

        api(`/api/model/objects/${selected}/versions`).then((data) => {
            if (data.ok) {
                const list = data.versions || [];
                setVersions(list);
                setSelectedVersion(list[0]?.commit || "");
                setResult(null);
            }
        });
    }, [selected]);

    async function refreshVersions() {
        const refreshed = await api(`/api/model/objects/${selected}/versions`);

        if (refreshed.ok) {
            const list = refreshed.versions || [];
            setVersions(list);
            setSelectedVersion(list[0]?.commit || "");
        }
    }

    async function addField() {
        if (!fieldName.trim()) return;

        setLoading(true);

        const res = await fetch(`${API}/api/model/change/objects/${selected}/fields`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                fieldName,
                type: fieldType,
            }),
        });

        const data = await res.json();
        setResult(data);

        if (data.ok) {
            setFieldName("");
            await refreshVersions();
        }

        setLoading(false);
    }

    async function revertObjectToSelectedVersion() {
        if (!selected || !selectedVersion) return;

        const ok = window.confirm(
            `Revert ${selected}.java to V${version?.version} (${version?.shortCommit || selectedVersion})?`
        );

        if (!ok) return;

        setLoading(true);

        const res = await fetch(
            `${API}/api/git-workspace/files/data-object/${encodeURIComponent(selected + ".java")}/revert`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    commit: selectedVersion,
                }),
            }
        );

        const data = await res.json();
        setResult(data);

        await refreshVersions();

        setLoading(false);
    }

    return (
        <section>
            <div className="page-title-row">
                <div>
                    <h1>Data Object Governance</h1>
                    <p className="muted">
                        View Git-based data object schemas and create controlled model changes.
                    </p>
                </div>
            </div>

            <div className="card data-object-toolbar">
                <div className="data-object-toolbar-field">
                    <label>Selected Object</label>
                    <select
                        value={selected}
                        onChange={(e) => setSelected(e.target.value)}
                    >
                        {objects.map((o) => (
                            <option key={o} value={o}>
                                {o}
                            </option>
                        ))}
                    </select>
                </div>

                <div className="data-object-toolbar-field">
                    <label>Selected Version</label>
                    <select
                        value={selectedVersion}
                        onChange={(e) => setSelectedVersion(e.target.value)}
                    >
                        {versions.map((v) => (
                            <option key={v.commit} value={v.commit}>
                                V{v.version} · {v.shortCommit || v.commit}
                                {v.commit === currentVersion?.commit ? " · CURRENT" : ""}
                            </option>
                        ))}
                    </select>
                </div>

                <div className="revert-section">
                    <button
                        onClick={revertObjectToSelectedVersion}
                        disabled={loading || !selectedVersion || isCurrentVersion}
                        className="danger-button"
                    >
                        Revert to Selected Version
                    </button>

                    {isCurrentVersion && (
                        <span className="muted revert-message">
                            Selected version is already current.
                        </span>
                    )}
                </div>
            </div>

            <div className="grid">
                <div className="card">
                    <h2>Schema</h2>

                    <table>
                        <tbody>
                            <tr>
                                <th>Object</th>
                                <td><code>{selected}</code></td>
                            </tr>
                            <tr>
                                <th>Version</th>
                                <td>V{version?.version ?? "-"}</td>
                            </tr>
                            <tr>
                                <th>Commit</th>
                                <td><code>{version?.shortCommit || version?.commit || "-"}</code></td>
                            </tr>
                            <tr>
                                <th>Status</th>
                                <td>
                                    {version?.commit === currentVersion?.commit
                                        ? "CURRENT"
                                        : "HISTORICAL"}
                                    {version?.message?.toLowerCase().includes("revert")
                                        ? " / REVERT COMMIT"
                                        : ""}
                                </td>
                            </tr>
                            <tr>
                                <th>Fields</th>
                                <td>{version?.fieldCount ?? 0}</td>
                            </tr>
                        </tbody>
                    </table>

                    <SchemaTable schema={version?.schema || {}} />
                </div>

                <div className="card">
                    <h2>Add Field</h2>

                    <label>
                        Field name
                        <input
                            value={fieldName}
                            onChange={(e) => setFieldName(e.target.value)}
                            placeholder="co5"
                        />
                    </label>

                    <label>
                        Type
                        <select
                            value={fieldType}
                            onChange={(e) => setFieldType(e.target.value)}
                        >
                            <option>String</option>
                            <option>Double</option>
                            <option>Integer</option>
                            <option>Boolean</option>
                            <option>Date</option>
                        </select>
                    </label>

                    <button
                        onClick={addField}
                        disabled={loading || !fieldName.trim()}
                    >
                        {loading ? "Saving..." : "Add Field to Data Object"}
                    </button>

                    <p className="muted">
                        This updates the Git workspace. The git-rule-runner can use the
                        new field immediately.
                    </p>
                </div>
            </div>

            {result && (
                <div className="card">
                    <h2>Last Git Action</h2>
                    <JsonBlock data={result} />
                </div>
            )}
        </section>
    );
}

function SummaryCard({ title, value }) {
    return (
        <div className="card summary-card">
            <span>{title}</span>
            <strong>{value}</strong>
        </div>
    );
}

function SchemaTable({ schema }) {
    const entries = Object.entries(schema);

    if (!entries.length) {
        return <p className="muted">No fields in this version.</p>;
    }

    return (
        <div className="table-scroll">
            <table>
                <thead>
                    <tr>
                        <th>Field</th>
                        <th>Type</th>
                    </tr>
                </thead>

                <tbody>
                    {entries.map(([field, type]) => (
                        <tr key={field}>
                            <td><code>{field}</code></td>
                            <td><span className="type-pill">{type}</span></td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

function DataObjectResult({ result }) {
    const data = result.data;

    if (!data?.ok) {
        return (
            <div className="card">
                <h2>Result</h2>
                <JsonBlock data={data} />
            </div>
        );
    }

    if (result.type === "diff") {
        return (
            <div className="card">
                <h2>Schema Diff</h2>

                <div className="badges">
                    <span>Added: {data.summary.added}</span>
                    <span>Removed: {data.summary.removed}</span>
                    <span>Type changed: {data.summary.typeChanged}</span>
                    <span>Unchanged: {data.summary.unchanged}</span>
                </div>

                <ChangeTable title="Added Fields" rows={data.diff.addedFields} kind="ADDED" />
                <ChangeTable title="Removed Fields" rows={data.diff.removedFields} kind="REMOVED" />
                <ChangeTable title="Type Changes" rows={data.diff.typeChanges} kind="TYPE_CHANGED" />
            </div>
        );
    }

    if (result.type === "impact") {
        return (
            <div className="card">
                <h2>Impact Analysis</h2>

                <div className="badges">
                    <span>Changes: {data.impact.changeCount}</span>
                    <span>Added: {data.summary.added}</span>
                    <span>Removed: {data.summary.removed}</span>
                    <span>Type changed: {data.summary.typeChanged}</span>
                </div>

                <h3>Detected Changes</h3>
                <table>
                    <thead>
                        <tr>
                            <th>Kind</th>
                            <th>Field</th>
                            <th>From</th>
                            <th>To / Type</th>
                            <th>Severity</th>
                        </tr>
                    </thead>
                    <tbody>
                        {data.impact.changes.map((c, idx) => (
                            <tr key={idx}>
                                <td>{c.kind}</td>
                                <td><code>{c.field}</code></td>
                                <td>{c.from || "-"}</td>
                                <td>{c.to || c.type || "-"}</td>
                                <td><SeverityBadge value={c.severity} /></td>
                            </tr>
                        ))}
                    </tbody>
                </table>

                <h3>Affected Components</h3>
                <ul className="clean-list">
                    {data.impact.affectedComponents.map((x) => (
                        <li key={x}>{x}</li>
                    ))}
                </ul>

                <h3>Recommendations</h3>
                <ul className="clean-list">
                    {data.impact.recommendations.map((x) => (
                        <li key={x}>{x}</li>
                    ))}
                </ul>
            </div>
        );
    }

    if (result.type === "ai") {
        const review = data.ai?.review;

        return (
            <div className="card">
                <h2>AI Governance Review</h2>

                {!review ? (
                    <JsonBlock data={data.ai} />
                ) : (
                    <>
                        <div className="ai-review-header">
                            <div>
                                <span className="muted">Risk Level</span>
                                <SeverityBadge value={review.riskLevel} />
                            </div>

                            <div>
                                <span className="muted">Recommendation</span>
                                <strong>{review.approvalRecommendation}</strong>
                            </div>
                        </div>

                        <p>{review.summary}</p>

                        <h3>Required Actions</h3>
                        <table>
                            <thead>
                                <tr>
                                    <th>Component</th>
                                    <th>Action</th>
                                    <th>Reason</th>
                                </tr>
                            </thead>
                            <tbody>
                                {(review.requiredActions || []).map((a, idx) => (
                                    <tr key={idx}>
                                        <td>{a.component}</td>
                                        <td>{a.action}</td>
                                        <td>{a.reason}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>

                        <h3>Test Scenarios</h3>
                        <table>
                            <thead>
                                <tr>
                                    <th>Name</th>
                                    <th>Description</th>
                                    <th>Expected Result</th>
                                </tr>
                            </thead>
                            <tbody>
                                {(review.testScenarios || []).map((s, idx) => (
                                    <tr key={idx}>
                                        <td>{s.name}</td>
                                        <td>{s.description}</td>
                                        <td>{s.expectedResult}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>

                        <h3>Rollback Notes</h3>
                        <p>{review.rollbackNotes}</p>
                    </>
                )}
            </div>
        );
    }

    return (
        <div className="card">
            <JsonBlock data={data} />
        </div>
    );
}

function ChangeTable({ title, rows, kind }) {
    if (!rows?.length) return null;

    return (
        <>
            <h3>{title}</h3>
            <table>
                <thead>
                    <tr>
                        <th>Kind</th>
                        <th>Field</th>
                        <th>From</th>
                        <th>To / Type</th>
                    </tr>
                </thead>

                <tbody>
                    {rows.map((r, idx) => (
                        <tr key={idx}>
                            <td>{kind}</td>
                            <td><code>{r.field}</code></td>
                            <td>{r.from || "-"}</td>
                            <td>{r.to || r.type || "-"}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </>
    );
}

function SeverityBadge({ value }) {
    const text = String(value || "UNKNOWN").toUpperCase();
    let className = "severity-badge neutral";

    if (text === "LOW") className = "severity-badge low";
    if (text === "MEDIUM") className = "severity-badge medium";
    if (text === "HIGH") className = "severity-badge high";
    if (text === "CRITICAL") className = "severity-badge critical";

    return <span className={className}>{text}</span>;
}
function DrlRules() {
    const [rules, setRules] = useState([]);
    const [selected, setSelected] = useState("");
    const [versions, setVersions] = useState([]);
    const [selectedVersion, setSelectedVersion] = useState("");
    const [content, setContent] = useState(null);
    const [loading, setLoading] = useState(false);
    const [actionResult, setActionResult] = useState(null);
    const currentVersion = versions[versions.length - 1];
    const isCurrentVersion = selectedVersion === currentVersion?.commit;
    const version =
        versions.find((v) => v.commit === selectedVersion) || versions[0];
    async function revertToSelectedVersion() {
        if (!selected || !selectedVersion) return;

        const ok = window.confirm(
            `Revert ${selected} to ${version?.shortCommit || selectedVersion}?`
        );

        if (!ok) return;

        setLoading(true);

        const res = await fetch(
            `${API}/api/git-workspace/files/drl/${encodeURIComponent(selected)}/revert`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    commit: selectedVersion,
                }),
            }
        );

        const data = await res.json();
        setActionResult(data);

        const versionsData = await api(
            `/api/git-workspace/files/drl/${encodeURIComponent(selected)}/versions`
        );

        if (versionsData.ok) {
            const list = versionsData.versions || [];
            setVersions(list);
            setSelectedVersion(list[list.length - 1]?.commit || "");
        }

        setLoading(false);
    }
    useEffect(() => {
        api("/api/git-workspace/files").then((data) => {
            if (data.ok) {
                const drlFiles = data.drlFiles || [];
                setRules(drlFiles);

                setSelected(
                    drlFiles.includes("pollution-alerts.drl")
                        ? "pollution-alerts.drl"
                        : drlFiles[0] || ""
                );
            }
        });
    }, []);

    useEffect(() => {
        if (!selected) return;

        api(`/api/git-workspace/files/drl/${encodeURIComponent(selected)}/versions`).then(
            (data) => {
                if (data.ok) {
                    setVersions(data.versions || []);
                    const list = data.versions || [];
                    setVersions(list);
                    setSelectedVersion(list[list.length - 1]?.commit || "");
                }
            }
        );
    }, [selected]);

    useEffect(() => {
        if (!selected || !selectedVersion) return;

        setLoading(true);

        api(
            `/api/model/rules/${encodeURIComponent(
                selected
            )}/content/${encodeURIComponent(selectedVersion)}`
        )
            .then((data) => {
                setContent(data);
            })
            .finally(() => {
                setLoading(false);
            });
    }, [selected, selectedVersion]);

    return (
        <section>
            <div className="page-title-row">
                <div>
                    <h1>DRL Rule Governance</h1>
                    <p className="muted">
                        View Git-based DRL assets, selected version, extracted rule names,
                        and the full DRL source.
                    </p>
                </div>
            </div>

            <div className="card drl-toolbar">
                <div className="drl-toolbar-field">
                    <label>Selected DRL</label>
                    <select
                        value={selected}
                        onChange={(e) => setSelected(e.target.value)}
                    >
                        {rules.map((r) => (
                            <option key={r} value={r}>
                                {r}
                            </option>
                        ))}
                    </select>
                </div>

                <div className="drl-toolbar-field">
                    <label>Selected Version</label>
                    <select
                        value={selectedVersion}
                        onChange={(e) => setSelectedVersion(e.target.value)}
                    >
                        {[...versions].reverse().map((v) => (
                            <option key={v.commit} value={v.commit}>
                                V{v.version} · {v.shortCommit || v.commit}
                                {v.commit === currentVersion?.commit ? " · CURRENT" : ""}
                            </option>
                        ))}
                    </select>
                </div>

                <div className="revert-section">
                    <button
                        onClick={revertToSelectedVersion}
                        disabled={loading || !selectedVersion || isCurrentVersion}
                        className="danger-button"
                    >
                        Revert to Selected Version
                    </button>

                    {isCurrentVersion && (
                        <span className="muted revert-message">
                            Selected version is already current.
                        </span>
                    )}
                </div>
            </div>

            <div className="grid">
                <div className="card">
                    <h2>Rules in Selected Version</h2>

                    {!version?.rules?.length ? (
                        <p className="muted">
                            Rule names are not available from the Git workspace versions endpoint yet.
                        </p>
                    ) : (
                        <ul className="rule-list">
                            {version.rules.map((rule) => (
                                <li key={rule}>
                                    <FileCode size={15} />
                                    <span>{rule}</span>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>

                <div className="card">
                    <h2>Selected DRL Metadata</h2>

                    <table>
                        <tbody>
                            <tr>
                                <th>File</th>
                                <td>
                                    <code>{selected}</code>
                                </td>
                            </tr>
                            <tr>
                                <th>Version</th>
                                <td>V{version?.version ?? "-"}</td>
                            </tr>
                            <tr>
                                <th>Commit</th>
                                <td>
                                    <code>{version?.shortCommit || version?.commit || "-"}</code>
                                </td>
                            </tr>
                            <tr>
                                <th>Message</th>
                                <td>{version?.message || "-"}</td>
                            </tr>
                            <tr>
                                <th>Status</th>
                                <td>
                                    {version?.commit === currentVersion?.commit
                                        ? "CURRENT"
                                        : "HISTORICAL"}
                                    {version?.message?.toLowerCase().includes("revert")
                                        ? " / REVERT COMMIT"
                                        : ""}
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>

            <div className="card">
                <h2>Full Selected DRL</h2>

                {loading && <p className="muted">Loading DRL...</p>}

                {!loading && !content?.ok && (
                    <JsonBlock data={content || { message: "No DRL loaded yet" }} />
                )}

                {!loading && content?.ok && (
                    <pre className="code">{content.content}</pre>
                )}
            </div>

            {actionResult && (
                <div className="card">
                    <h2>Last Git Action</h2>
                    <JsonBlock data={actionResult} />
                </div>
            )}
        </section>
    );
}

function DrlResult({ result }) {
    const data = result.data;

    if (!data?.ok) {
        return (
            <div className="card">
                <h2>DRL Result</h2>
                <JsonBlock data={data} />
            </div>
        );
    }

    if (result.type === "content") {
        return (
            <div className="card">
                <h2>DRL Content</h2>

                <div className="badges">
                    <span>{data.ruleFile}</span>
                    <span>{data.commit}</span>
                    <span>{data.rules?.length ?? 0} rules</span>
                </div>

                <pre className="code">{data.content}</pre>
            </div>
        );
    }

    if (result.type === "ruleDiff") {
        return (
            <div className="card">
                <h2>DRL Version Diff</h2>

                <div className="badges">
                    <span>Added: {data.summary.added}</span>
                    <span>Removed: {data.summary.removed}</span>
                    <span>Unchanged: {data.summary.unchanged}</span>
                </div>

                <div className="grid">
                    <div>
                        <h3>Added Rules</h3>
                        <RuleNameList items={data.addedRules} empty="No added rules." />
                    </div>

                    <div>
                        <h3>Removed Rules</h3>
                        <RuleNameList items={data.removedRules} empty="No removed rules." />
                    </div>
                </div>

                <h3>Raw Git Diff</h3>
                <pre className="code">{data.rawDiff}</pre>
            </div>
        );
    }

    return (
        <div className="card">
            <JsonBlock data={data} />
        </div>
    );
}

function RuleNameList({ items, empty }) {
    if (!items?.length) {
        return <p className="muted">{empty}</p>;
    }

    return (
        <ul className="rule-list compact">
            {items.map((item) => (
                <li key={item}>
                    <FileCode size={15} />
                    <span>{item}</span>
                </li>
            ))}
        </ul>
    );
}
function MonitoringDashboard() {
    return (
        <section>
            <h1>Monitoring Dashboard</h1>

            <div className="card">
                <iframe
                    className="grafana-frame"
                    src="http://localhost:3002/public-dashboards/69cedf331d63407b9357480c334ebabe"
                    allowFullScreen
                    title="Pollution Dashboard"
                />
            </div>
        </section>
    );
}
function getTextPayload(value) {
    return JSON.stringify(value || {});
}

function isKieServerUp(status) {
    return status?.kie === "UP" || status?.ok === true || getTextPayload(status).includes("SUCCESS");
}

function isKieContainerStarted(status, actionResult) {
    const text = `${getTextPayload(status)} ${getTextPayload(actionResult)}`;

    return (
        text.includes("pollution-rules_1.0.0") &&
        (text.includes("STARTED") || text.includes("already exists"))
    );
}
function RuntimeDashboard() {
    const [overview, setOverview] = useState(null);
    const [actionResult, setActionResult] = useState(null);
    const [loading, setLoading] = useState(false);

    const kieServerUp = Boolean(overview?.kieServerUp);
    const projects = overview?.projects || [];
    const containers = overview?.containers || [];

    async function loadOverview() {
        try {
            const data = await api("/api/runtime/overview");
            setOverview(data);
        } catch (e) {
            setOverview({
                ok: false,
                kieServerUp: false,
                error: String(e),
                projects: [],
                containers: [],
            });
        }
    }

    async function runAction(label, request) {
        setLoading(true);

        try {
            const res = await request();
            const data = await res.json();

            setActionResult({
                label,
                at: new Date().toLocaleString(),
                ...data,
            });

            await loadOverview();
        } catch (e) {
            setActionResult({
                label,
                ok: false,
                at: new Date().toLocaleString(),
                error: String(e),
            });
        } finally {
            setLoading(false);
        }
    }

    function deployProject(project) {
        return runAction("Deploy container", () =>
            fetch(`${API}/api/runtime/containers/${project.containerId}/deploy`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    groupId: project.groupId,
                    artifactId: project.artifactId,
                    version: project.version,
                }),
            })
        );
    }

    function startContainer(containerId) {
        return runAction("Start container", () =>
            fetch(`${API}/api/runtime/containers/${containerId}/start`, {
                method: "POST",
            })
        );
    }

    function stopContainer(containerId) {
        return runAction("Stop container", () =>
            fetch(`${API}/api/runtime/containers/${containerId}/stop`, {
                method: "POST",
            })
        );
    }

    function deleteContainer(containerId) {
        return runAction("Delete container", () =>
            fetch(`${API}/api/runtime/containers/${containerId}`, {
                method: "DELETE",
            })
        );
    }
    function testDummy(containerId) {
        return runAction("Run dummy rule test", () =>
            fetch(`${API}/api/runtime/containers/${containerId}/test-dummy`, {
                method: "POST",
            })
        );
    }
    useEffect(() => {
        loadOverview();
    }, []);

    return (
        <section>
            {/* <div className="page-title-row">
                <h1>Runtime Control</h1>

                <div className="mini-status-row">
                    <MiniStatus label="KIE Server" ok={kieServerUp} />
                    <MiniStatus
                        label="Active Containers"
                        ok={containers.some((c) => c.status === "STARTED")}
                        text={`${containers.filter((c) => c.status === "STARTED").length}/${containers.length}`}
                    />
                </div>
            </div> */}

            {loading && <div className="small-loading">Working...</div>}

            <div className="card">
                <h2>Business Central Projects / KIE Containers</h2>

                <div className="table-scroll">
                    <table>
                        <thead>
                            <tr>
                                <th>Project</th>
                                <th>GAV</th>
                                <th>Container ID</th>
                                <th>Status</th>
                                <th>Actions</th>
                            </tr>
                        </thead>

                        <tbody>
                            {projects.map((project) => {
                                const status = project.containerStatus;
                                const isStarted = status === "STARTED";
                                const isStopped = status === "STOPPED";
                                const isDeployed = project.deployed;

                                return (
                                    <tr key={`${project.spaceName}-${project.name}-${project.version}`}>
                                        <td>
                                            <strong>{project.name}</strong>
                                            <div className="muted">{project.spaceName}</div>
                                        </td>

                                        <td>
                                            <code>
                                                {project.groupId}:{project.artifactId}:{project.version}
                                            </code>
                                        </td>

                                        <td>
                                            <code>{project.deployedContainerId || project.containerId}</code>
                                        </td>

                                        <td>
                                            <StatusPill status={status} />
                                        </td>

                                        <td>
                                            <div className="icon-actions">
                                                {isDeployed && (
                                                    <button
                                                        className="icon-button neutral-action"
                                                        title="Run Dummy Rule Test"
                                                        disabled={loading}
                                                        onClick={() => testDummy(project.deployedContainerId)}
                                                    >
                                                        ⚡
                                                    </button>
                                                )}
                                                {!isDeployed && (
                                                    <button
                                                        className="icon-button success"
                                                        title="Deploy"
                                                        disabled={loading}
                                                        onClick={() => deployProject(project)}
                                                    >
                                                        ✓
                                                    </button>
                                                )}

                                                {isStopped && (
                                                    <button
                                                        className="icon-button success"
                                                        title="Start"
                                                        disabled={loading}
                                                        onClick={() => startContainer(project.deployedContainerId)}
                                                    >
                                                        ▶
                                                    </button>
                                                )}

                                                {isStarted && (
                                                    <button
                                                        className="icon-button warning"
                                                        title="Stop"
                                                        disabled={loading}
                                                        onClick={() => stopContainer(project.deployedContainerId)}
                                                    >
                                                        ■
                                                    </button>
                                                )}

                                                {isDeployed && (
                                                    <button
                                                        className="icon-button danger"
                                                        title="Delete / Dispose"
                                                        disabled={loading}
                                                        onClick={() => deleteContainer(project.deployedContainerId)}
                                                    >
                                                        ×
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}

                            {!projects.length && (
                                <tr>
                                    <td colSpan="5">No Business Central projects found.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {containers.length > 0 && (
                <div className="card">
                    <h2>Deployed Containers</h2>

                    <div className="table-scroll">
                        <table>
                            <thead>
                                <tr>
                                    <th>Container ID</th>
                                    <th>Alias</th>
                                    <th>GAV</th>
                                    <th>Status</th>
                                </tr>
                            </thead>

                            <tbody>
                                {containers.map((container) => (
                                    <tr key={container.containerId}>
                                        <td><code>{container.containerId}</code></td>
                                        <td>{container.alias || "-"}</td>
                                        <td>
                                            <code>
                                                {container.groupId}:{container.artifactId}:{container.version}
                                            </code>
                                        </td>
                                        <td><StatusPill status={container.status} /></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {actionResult && (
                <div className="card compact-result">
                    <h2>Last Action</h2>
                    <p>
                        <strong>{actionResult.label}</strong> —{" "}
                        <span className={actionResult.ok ? "status-ok" : "status-bad"}>
                            {actionResult.ok ? "OK" : "FAILED"}
                        </span>
                        <span className="muted"> · {actionResult.at}</span>
                    </p>
                    <JsonBlock data={actionResult} />
                </div>
            )}
        </section>
    );
}

function MiniStatus({ label, ok, text }) {
    return (
        <div className={`mini-status ${ok ? "ok" : "bad"}`}>
            <span className="mini-dot" />
            <span>{label}</span>
            {text && <strong>{text}</strong>}
        </div>
    );
}

function StatusPill({ status }) {
    const normalized = String(status || "UNKNOWN").toUpperCase();

    let className = "pill neutral";
    if (normalized === "STARTED") className = "pill success";
    if (normalized === "STOPPED") className = "pill warning";
    if (normalized === "NOT_DEPLOYED") className = "pill danger";

    return <span className={className}>{normalized}</span>;
}

function StatusCard({ title, ok, okText, badText, detail }) {
    return (
        <div className="card status-card">
            <div className={`status-dot ${ok ? "green" : "red"}`} />
            <div>
                <h2>{title}</h2>
                <p className={ok ? "status-ok" : "status-bad"}>
                    {ok ? okText : badText}
                </p>
                <small>{detail}</small>
            </div>
        </div>
    );
}

function DataTable({ title, data }) {
    if (!data.length) {
        return (
            <div className="card">
                <h2>{title}</h2>
                <p>No rows found.</p>
            </div>
        );
    }

    const columns = Object.keys(data[0]);

    return (
        <div className="card">
            <h2>{title}</h2>

            <div className="table-scroll">
                <table>
                    <thead>
                        <tr>
                            {columns.map((col) => (
                                <th key={col}>{col}</th>
                            ))}
                        </tr>
                    </thead>

                    <tbody>
                        {data.map((row, idx) => (
                            <tr key={idx}>
                                {columns.map((col) => (
                                    <td key={col}>{String(row[col] ?? "")}</td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
function RuleGenerator() {
    const [prompt, setPrompt] = useState("Create a CRITICAL alert when the night shift PM2.5 average exceeds 60 and at least 20 measurements were used.");
    const [result, setResult] = useState(null);
    const [loading, setLoading] = useState(false);

    async function generate() {
        setLoading(true);

        const res = await fetch(`${API}/api/ai-rules/generate`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ prompt }),
        });

        const data = await res.json();
        setResult(data);
        setLoading(false);
    }

    return (
        <section>
            <h1>AI Rule Generator</h1>

            <div className="card">
                <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} />
                <button onClick={generate}><Brain size={16} /> Generate Rule</button>
            </div>

            {loading && <div className="card">Generating...</div>}

            {result && (
                <div className="card">
                    <h2>Result</h2>
                    {result.generatedDrl && <pre className="code">{result.generatedDrl}</pre>}
                    <JsonBlock data={result} />
                </div>
            )}
        </section>
    );
}

function ResultPanel({ loading, result }) {
    if (loading) return <div className="card">Loading...</div>;
    if (!result) return null;

    const data = result.data;

    if (result.type === "impact" && data.ok) {
        return (
            <div className="card">
                <h2>Impact Analysis</h2>
                <div className="badges">
                    <span>Added: {data.summary.added}</span>
                    <span>Removed: {data.summary.removed}</span>
                    <span>Type changed: {data.summary.typeChanged}</span>
                </div>
                <JsonBlock data={data.impact} />
            </div>
        );
    }

    if (result.type === "ai" && data.ok) {
        return (
            <div className="card">
                <h2>AI Review</h2>
                {data.ai?.review ? <JsonBlock data={data.ai.review} /> : <JsonBlock data={data.ai} />}
            </div>
        );
    }

    if (result.type === "ruleDiff" && data.ok) {
        return (
            <div className="card">
                <h2>DRL Diff</h2>
                <div className="badges">
                    <span>Added: {data.summary.added}</span>
                    <span>Removed: {data.summary.removed}</span>
                    <span>Unchanged: {data.summary.unchanged}</span>
                </div>
                <h3>Added Rules</h3>
                <ul>{data.addedRules.map((r) => <li key={r}>{r}</li>)}</ul>
                <h3>Raw Diff</h3>
                <pre className="code">{data.rawDiff}</pre>
            </div>
        );
    }

    if (result.type === "content" && data.ok) {
        return (
            <div className="card">
                <h2>DRL Content</h2>
                <pre className="code">{data.content}</pre>
            </div>
        );
    }

    return (
        <div className="card">
            <JsonBlock data={data} />
        </div>
    );
}

export default App;