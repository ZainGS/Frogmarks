import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../services/auth/auth.service';

@Component({
  selector: 'app-signin',
  templateUrl: './signin.component.html',
  styleUrls: ['./signin.component.scss']
})
export class SignInComponent implements OnInit {

  constructor(private authService: AuthService, private route: ActivatedRoute, private router: Router) {}

  ngOnInit(): void {
    this.route.queryParams.subscribe(
      {
        next: (params) => {
          const token = params['token'];
          if (token) {
            this.authService.validateEmailToken(token).subscribe({
              next: (response) => {
                console.log('Response headers:', response.headers.keys());
                // console.log('Token validated');
                console.log(response);
                this.router.navigate(['dashboard']);
              },
              error: (error) => {
                console.error('Token validation failed', error);
              }
            });;
          }
        },
        error: (err) => {
         console.error('Error fetching query params', err);
        }
      });
  }
}
