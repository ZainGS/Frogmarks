import { Injectable } from "@angular/core";
import { applicationConfig } from "../../../core/app.config";
import { ClientConfig } from "../../../core/client-config";

@Injectable({
  providedIn: 'root'
})
export class ConfigurationService {

  systemConfiguration = {} as ClientConfig;

  constructor() {
    this.loadConfigurations();
  }

  loadConfigurations(): ClientConfig {
    let currentConfig: ClientConfig;
    switch (window.location.hostname) {
      case this.getHostName(applicationConfig.production.clientUrl):
        currentConfig = applicationConfig.production;
        break;
      case this.getHostName(applicationConfig.uat.clientUrl):
        currentConfig = applicationConfig.uat;
        break;
      case this.getHostName(applicationConfig.qa.clientUrl):
        currentConfig = applicationConfig.qa;
        break;
      case this.getHostName(applicationConfig.staging.clientUrl):
        currentConfig = applicationConfig.staging;
        break;
      default:
        currentConfig = applicationConfig.local;
    }
    this.systemConfiguration = currentConfig;
    return currentConfig;
  }

  private getHostName(url: string): string {
    const urlObject = new URL(url);
    return urlObject.hostname;
  }

}
