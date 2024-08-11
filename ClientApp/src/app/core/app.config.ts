const clientName = 'Frogmarks'

export const applicationConfig = {
  defaults: {
    title: 'Frogmarks',
    shortTitle: 'FMarks',
    clientName: clientName
  },
  production: {
    clientId: '',
    clientUrl: 'https://frogmarks.com/',
    apiUri: 'https://api.frogmarks.com/',
    redirectUri: '',
    postLogoutRedirectUri: '',
    roleScope: 'prod',
    clientName: clientName,
  },
  uat: {
    clientId: '',
    clientUrl: 'https://uat.frogmarks.com/',
    apiUri: 'https://uat-api.frogmarks.com/',
    redirectUri: '',
    postLogoutRedirectUri: '',
    roleScope: 'uat',
    clientName: clientName,
  },
  qa: {
    clientId: '',
    clientUrl: 'https://qa.frogmarks.com/',
    apiUri: 'https://qa-api.frogmarks.com/',
    redirectUri: '',
    postLogoutRedirectUri: '',
    roleScope: 'qa',
    clientName: clientName,
  },
  staging: {
    clientId: '',
    clientUrl: 'https://staging.frogmarks.com/',
    apiUri: 'https://staging-api.frogmarks.com/',
    redirectUri: '',
    postLogoutRedirectUri: '',
    roleScope: 'staging',
    clientName: clientName,
  },
  local: {
    clientId: '',
    clientUrl: 'http://localhost:4200',
    apiUri: 'https://localhost:44362',
    redirectUri: '',
    postLogoutRedirectUri: '',
    roleScope: 'local',
    clientName: clientName,
  }
};
