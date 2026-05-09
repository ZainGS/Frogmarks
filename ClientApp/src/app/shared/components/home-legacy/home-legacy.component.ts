import { Component, OnInit, OnDestroy } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { AuthService } from '../../services/auth/auth.service';
import { Router } from '@angular/router';

@Component({
  selector: 'app-home-legacy',
  templateUrl: './home-legacy.component.html',
  styleUrl: './home-legacy.component.scss'
})
export class HomeLegacyComponent implements OnInit, OnDestroy {

  emailForm!: FormGroup;

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private router: Router
  ) {}

  ngOnInit(): void {
    document.body.classList.remove('base-body');
    this.emailForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
    });
  }

  ngOnDestroy(): void {
    document.body.classList.add('base-body');
  }

  onSubmit(): void {
    if (this.emailForm.valid) {
      var email: string = this.emailForm.controls['email'].value;
      this.authService.sendSignInEmail(email).subscribe(x => {
        this.router.navigate(['/check-your-email'], { state: { email: email } });
      });
    }
  }

}
