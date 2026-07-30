export const lineDisplayName = (line) =>
  (line?.isBranch ? line.branchName || line.name : line?.name) || line?.id || "Line";

export const lineSystemId = (line) =>
  line?.systemId ||
  line?.transmissionSystemId ||
  line?.parentSystemId ||
  line?.system_id ||
  line?.transmission_system_id ||
  line?.canvasSystemId ||
  "";

export const lineBelongsToSystem = (line, systemId) =>
  !!systemId && lineSystemId(line) === systemId;
