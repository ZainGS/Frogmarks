import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CheckYourEmailComponent } from './check-your-email.component';

describe('CheckYourEmailComponent', () => {
  let component: CheckYourEmailComponent;
  let fixture: ComponentFixture<CheckYourEmailComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CheckYourEmailComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(CheckYourEmailComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
