import { ComponentFixture, TestBed } from '@angular/core/testing';

import { UpgradeModalComponent } from './upgrade-modal.component';

describe('UpgradeModalComponent', () => {
  let component: UpgradeModalComponent;
  let fixture: ComponentFixture<UpgradeModalComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UpgradeModalComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(UpgradeModalComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
