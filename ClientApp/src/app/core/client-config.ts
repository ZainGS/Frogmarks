export interface ClientConfig {
  clientId: string;
  clientUrl: string;
  apiUri: string;
  redirectUri?: string;
  postLogoutRedirectUri?: string;
  roleScope: string;
  clientName: string;
}
