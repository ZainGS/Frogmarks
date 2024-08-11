import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { AuthService } from '../../services/auth/auth.service';
import { Router } from '@angular/router';

@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss'
})
export class HomeComponent implements OnInit {
  
  emailForm: FormGroup =  this.fb.group({
    email: ['', [Validators.required, Validators.email]],
  });

  constructor(private fb: FormBuilder, private authService: AuthService, private router: Router) {}

  ngOnInit(): void {

  }

  onSubmit(): void {
    if (this.emailForm.valid) {
      var email: string = this.emailForm.controls['email'].value;
      this.authService.sendSignInEmail(email).subscribe(x => {
        this.router.navigate(['/check-your-email'], { state: { email: email } });
      });
      
    }
  }

  test(): void {
    console.log("test");
  }
  
}
