import { Component, OnInit } from '@angular/core';
import { NavbarService } from '../../services/navbar/navbar.service';
import { Router, NavigationEnd } from '@angular/router';

@Component({
  selector: 'app-nav-menu',
  templateUrl: './nav-menu.component.html',
  styleUrls: ['./nav-menu.component.css']
})
export class NavMenuComponent implements OnInit {
  isExpanded = false;
  _navbarService: NavbarService;

  constructor(private router: Router, private navbarService: NavbarService) {
    this._navbarService = navbarService;
  }


  ngOnInit(): void {
    this.router.events.subscribe((event: any) => {
      
      if (event instanceof NavigationEnd) {
        // Show the navbar only on certain routes
        if (this.router.url === '/' 
          || this.router.url.startsWith('/home')
          || this.router.url.startsWith('/check-your-email')) {
          this.navbarService.show();
        } else {
          this.navbarService.hide();
        }
      }
    });
  }

  collapse() {
    this.isExpanded = false;
  }

  toggle() {
    this.isExpanded = !this.isExpanded;
  }
}
