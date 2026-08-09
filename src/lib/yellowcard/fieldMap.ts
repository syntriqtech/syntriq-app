// Cell addresses for every field we read from the two relevant sheets.
// "label" is the cell containing the field name text (used for drift detection);
// "value" is the cell to the right that holds the actual data.

export const JOB_INFO = {
  gcName:           { label: "A6",  value: "E6"  },
  gcProject:        { label: "A7",  value: "E7"  },
  gcStreet:         { label: "A8",  value: "E8"  },
  gcCityStateZip:   { label: "A9",  value: "E9"  },
  gcPhone:          { label: "A10", value: "E10" },
  gcFax:            { label: "A11", value: "E11" },
  gcPmName:         { label: "A12", value: "E12" },
  gcPmEmail:        { label: "A13", value: "E13" },
  gcPmMobile:       { label: "A14", value: "E14" },
  jobName:          { label: "J6",  value: "M6"  },
  poNumber:         { label: "J7",  value: "M7"  },
  jobStreet:        { label: "J8",  value: "M8"  },
  jobCityStateZip:  { label: "J9",  value: "M9"  },
  originalContract: { label: "J10", value: "M10" },
  ohAndP:           { label: "J11", value: "M11" },
  ctiPmName:        { label: "J12", value: "M12" },
  ctiEmail:         { label: "J13", value: "M13" },
  ctiPhone:         { label: "J14", value: "M14" },
} as const;

export const YELLOW_CARD = {
  retention:        { label: "D1",  value: "F1"  },
  awardDate:        { label: "J13", value: "K13" },
  ownerName:        { label: "A16", value: "C16" },
  ownerAddress:     { label: "A17", value: "C17" },
  ownerCityStateZip:{ label: "A18", value: "C18" },
  ownerPhone:       { label: "A19", value: "C19" },
  ownerContact:     { label: "A20", value: "C20" },
  estimator:        { label: "K23", value: "L23" },
  projectMgr:       { label: "K24", value: "L24" },
  county:           { label: "K25", value: "L25" },
  tileScopeValue:   { label: "A35", value: "C35" },
  changeOrderRate:  { label: "A39", value: "C39" },
} as const;
