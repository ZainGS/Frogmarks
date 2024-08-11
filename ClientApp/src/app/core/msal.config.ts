import { LogLevel, Configuration, BrowserCacheLocation } from '@azure/msal-browser';
import { ClientConfig } from './client-config';
import { applicationConfig } from './app.config';

declare const window: Window;
const isIE = window.navigator.userAgent.indexOf("MSIE ") > -1 || window.navigator.userAgent.indexOf("Trident/") > -1;
const isSafari = ((navigator.userAgent.indexOf('Safari') !== -1 && navigator.userAgent.indexOf('Chrome') === -1));
let currentConfig: ClientConfig;
currentConfig = getClientConfig()
function getClientConfig(): ClientConfig {
  switch (window.location.hostname) {
    case getHostName(applicationConfig.production.clientUrl):
      currentConfig = applicationConfig.production;
      break;
    case getHostName(applicationConfig.uat.clientUrl):
      currentConfig = applicationConfig.uat;
      break;
    case getHostName(applicationConfig.qa.clientUrl):
      currentConfig = applicationConfig.qa;
      break;
    case getHostName(applicationConfig.staging.clientUrl):
      currentConfig = applicationConfig.staging;
      break;
    default:
      currentConfig = applicationConfig.local;
  }
  return currentConfig;
}

function getHostName(url: string): string {
  const urlObject = new URL(url);
  return urlObject.hostname;
}

/**
 * Configuration object to be passed to MSAL instance on creation.
 * For a full list of MSAL.js configuration parameters, visit:
 * https://github.com/AzureAD/microsoft-authentication-library-for-js/blob/dev/lib/msal-browser/docs/configuration.md
 */
export const msalConfig: Configuration = {
  auth: {
    clientId: currentConfig.clientId, // This is the ONLY mandatory field that you need to supply.
    authority: 'https://login.microsoftonline.com/70de1992-07c6-480f-a318-a1afcba03983', // Defaults to "https://login.microsoftonline.com/common"
    redirectUri: currentConfig.redirectUri, //'https://localhost:4200', // Points to window.location.origin by default. You must register this URI on Azure portal/App Registration.
    postLogoutRedirectUri: currentConfig.postLogoutRedirectUri,//'https://localhost:4200', // Points to window.location.origin by default.
    clientCapabilities: ['CP1'],// This lets the resource server know that this client can handle claim challenges.
  },
  cache: {
    cacheLocation: BrowserCacheLocation.LocalStorage, // Configures cache location. "sessionStorage" is more secure, but "localStorage" gives you SSO between tabs.
    storeAuthStateInCookie: isIE || isSafari, // Set this to "true" if you are having issues on IE11 or Edge. Remove this line to use Angular Universal
  },
  system: {
    /**
     * Below you can configure MSAL.js logs. For more information, visit:
     * https://docs.microsoft.com/azure/active-directory/develop/msal-logging-js
     */
    loggerOptions: {
      loggerCallback(logLevel: LogLevel, message: string) {
        // console.log(message);
      },
      logLevel: LogLevel.Error,
      piiLoggingEnabled: false
    }
  }
}

/**
 * Add here the endpoints and scopes when obtaining an access token for protected web APIs. For more information, see:
 * https://github.com/AzureAD/microsoft-authentication-library-for-js/blob/dev/lib/msal-browser/docs/resources-and-scopes.md
 */
export const protectedResources = {
  backendAPI: {
    endpoint: currentConfig.apiUri,  //"https://localhost/frogmarksapi/api",
    scopes: {
      role: [currentConfig.roleScope] //["api://12345678-1234-1234-1234-123456789876/api.scope"]
    }
  },
  msgraphApi: {
    endpoint: "https://graph.microsoft.com/v1.0",
    scopes: {
      UserRead: ["User.Read"]
    }
  }
}
//https://localhost/frogmarksapi/api/todolist
/**
 * Scopes you add here will be prompted for user consent during sign-in.
 * By default, MSAL.js will add OIDC scopes (openid, profile, email) to any login request.
 * For more information about OIDC scopes, visit:
 * https://docs.microsoft.com/en-us/azure/active-directory/develop/v2-permissions-and-consent#openid-connect-scopes
 */
export const loginRequest = {
  scopes: ['openid', 'profile', 'email', 'User.Read']
};
