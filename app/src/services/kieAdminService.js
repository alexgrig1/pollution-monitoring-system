import { getKieConfig, buildKieHeaders } from "./kieService.js";

export function getReleaseConfig() {
  return {
    groupId: process.env.KIE_GROUP_ID ?? "com.myspace.pollution",
    artifactId: process.env.KIE_ARTIFACT_ID ?? "pollution-rules",
    version: process.env.KIE_VERSION ?? "1.0.0",
  };
}

export async function getKieStatus() {
  const config = getKieConfig();
  const url = `${config.baseUrl}/server/containers`;

  const response = await fetch(url, {
    method: "GET",
    headers: buildKieHeaders(config.user, config.pass),
  });

  const text = await response.text();

  return {
    kie: response.ok ? "UP" : "DOWN",
    status: response.status,
    url,
    response: text.slice(0, 500),
  };
}

export async function deployKieContainer() {
  const config = getKieConfig();
  const release = getReleaseConfig();

  const url = `${config.baseUrl}/server/containers/${config.containerId}`;

  const payload = {
    "container-id": config.containerId,
    "release-id": {
      "group-id": release.groupId,
      "artifact-id": release.artifactId,
      version: release.version,
    },
  };

  const response = await fetch(url, {
    method: "PUT",
    headers: buildKieHeaders(config.user, config.pass),
    body: JSON.stringify(payload),
  });

  const text = await response.text();

  return {
    ok: response.ok,
    status: response.status,
    url,
    payload,
    response: text,
  };
}