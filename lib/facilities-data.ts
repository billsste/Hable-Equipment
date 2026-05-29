export type Facility = {
  id: number;
  name: string;
  initials: string;
  active: boolean;
};

export const INITIAL_FACILITIES: Facility[] = [
  { id: 1,  name: "Allegria Village",                    initials: "AV",   active: true },
  { id: 2,  name: "Canterbury on the Lake",              initials: "CL",   active: true },
  { id: 3,  name: "Evergreen Health & Rehabilitation Center", initials: "EG", active: true },
  { id: 4,  name: "Fountain Bleu",                       initials: "FB",   active: true },
  { id: 5,  name: "Glacier Hills",                       initials: "GH",   active: true },
  { id: 6,  name: "Greenfield Nursing",                  initials: "GN",   active: true },
  { id: 7,  name: "Lakeland Center",                     initials: "LC",   active: true },
  { id: 8,  name: "Lourdes Nursing Center",              initials: "LN",   active: true },
  { id: 9,  name: "Maple Manor of Novi",                 initials: "MMN",  active: true },
  { id: 10, name: "Maple Manor of Wayne",                initials: "MMW",  active: true },
  { id: 11, name: "Marywood Nursing Center",             initials: "MN",   active: true },
  { id: 12, name: "Novi Lakes",                          initials: "NL",   active: true },
  { id: 13, name: "Optalis Ann Arbor",                   initials: "OAA",  active: true },
  { id: 14, name: "Optalis Grosse Pointe",               initials: "OGP",  active: true },
  { id: 15, name: "Optalis Sterling Heights",            initials: "OSH",  active: true },
  { id: 16, name: "Optalis Troy",                        initials: "OT",   active: true },
  { id: 17, name: "Riverview Jefferson Health",          initials: "RJH",  active: true },
  { id: 18, name: "Shelby Nursing Center",               initials: "SNC",  active: true },
  { id: 19, name: "ShorePointe Nursing Center",          initials: "SPN",  active: true },
  { id: 20, name: "South Lyon Senior Care",              initials: "SLS",  active: true },
  { id: 21, name: "Wellbridge of Brighton",              initials: "WB-B", active: true },
  { id: 22, name: "Wellbridge of Novi",                  initials: "WB-N", active: true },
  { id: 23, name: "Wellbridge of Pinckney",              initials: "WB-P", active: true },
  { id: 24, name: "Wellbridge of Rochester",             initials: "WB-R", active: true },
  { id: 25, name: "Wellbridge of Romeo",                 initials: "WB-RM",active: true },
  { id: 26, name: "West Bloomfield Nursing Center",      initials: "WBNC", active: true },
  { id: 27, name: "West Oaks",                           initials: "WO",   active: true },
  { id: 28, name: "Westlake Health",                     initials: "WH",   active: true },
  { id: 29, name: "Woodward Hills Nursing Center",       initials: "WHN",  active: true },
  { id: 30, name: "Optalis Dearborn",                    initials: "OD",   active: true },
  { id: 31, name: "Regency of Livonia",                  initials: "RL",   active: true },
  { id: 32, name: "Mission Point of Detroit",            initials: "MPD",  active: true },
  { id: 33, name: "Mission Point of Holly",              initials: "MPH",  active: true },
  { id: 34, name: "Optalis Dearborn Heights",            initials: "ODH",  active: true },
  { id: 35, name: "Sanctuary Bellbrook",                 initials: "SB",   active: true },
];
