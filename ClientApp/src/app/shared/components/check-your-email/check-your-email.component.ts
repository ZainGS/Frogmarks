import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

@Component({
  selector: 'app-check-your-email',
  standalone: true,
  imports: [],
  templateUrl: './check-your-email.component.html',
  styleUrl: './check-your-email.component.scss'
})
export class CheckYourEmailComponent implements OnInit {
  email: string = "";

  constructor(private route: ActivatedRoute, private router: Router) { 
    
    const navigation = this.router.getCurrentNavigation();
    if (navigation?.extras?.state) {
      this.email = navigation.extras.state['email'];
    } else {
      // Handle the case where navigation is null (e.g., page refresh or direct access)
      this.route.queryParams.subscribe(params => {
        this.email = params['email'] || 'No email provided';
      });
    }
    
  }

  ngOnInit(): void {

  }
}
