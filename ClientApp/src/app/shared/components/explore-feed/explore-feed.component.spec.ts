import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ExploreFeedComponent } from './explore-feed.component';

describe('ExploreFeedComponent', () => {
  let component: ExploreFeedComponent;
  let fixture: ComponentFixture<ExploreFeedComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ExploreFeedComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(ExploreFeedComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
