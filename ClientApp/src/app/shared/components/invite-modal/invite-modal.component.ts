import { animate, group, state, style, transition, trigger } from '@angular/animations';
import { Component, HostListener, Inject } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';

@Component({
  selector: 'app-invite-modal',
  templateUrl: './invite-modal.component.html',
  styleUrls: ['./invite-modal.component.scss'],
  animations: [
    trigger('slideInOut', [
      state('flash-in', style({
        backgroundColor: '#6C63FF',
      })),
      state('in', style({
        backgroundColor: '#6C63FF',
      })),
      state('out', style({
        backgroundColor: 'transparent',
      })),
      transition('out => flash-in', [
        group([
          animate('0ms', style({
            backgroundColor: '#fff',
          })),
          animate('50ms', style({
            backgroundColor: '#fff',
          })),
          animate('150ms', style({
            backgroundColor: '#6C63FF',
          }))
        ])
      ]),
      transition('flash-in => in', [
        animate('300ms ease-in-out')
      ]),
      transition('in => out', [
        animate('300ms ease-in-out')
      ])
    ])
  ]
})

export class InviteModalComponent {

  // Click Host Listener for dropdown menus
    @HostListener('document:click', ['$event'])
    handleOutsideClick(event: MouseEvent) {
      const target = event.target as HTMLElement;
  
      // Check if the click was outside any .list-item
      if (!target.closest('.menu-container')
        && !target.closest('.filetype-dropdown-arrow')
        && !target.closest('.filetype-dropdown-chip')) {
        this.showPermissionTypeDropdown = false;
      }
    }

  inviteForm: FormGroup;
  permissionType: number = 0;
  showPermissionTypeDropdown: boolean = false;
  dropdownOptions: Map<number, string> = new Map<number, string>([[0, 'can edit'], [1, 'can view']]);

  constructor(
    private fb: FormBuilder,
    private dialogRef: MatDialogRef<InviteModalComponent>,
    @Inject(MAT_DIALOG_DATA) public data: any
  ) {
    this.inviteForm = this.fb.group({
      inviteLink: [data.inviteLink || 'https://www.frogmarks.com/team_invite/redeem/...', Validators.required],
      permission: ['edit', Validators.required],
      email: ['', [Validators.required, Validators.email]],
    });
  }

  togglePermission() { this.showPermissionTypeDropdown = !this.showPermissionTypeDropdown; }

  changePermissionType(permissionType: number) { this.permissionType = permissionType; }

  copyLink() {
    const inviteLink = this.inviteForm.get('inviteLink')?.value;
    navigator.clipboard.writeText(inviteLink).then(() => {
      alert('Link copied to clipboard!');
    });
  }

  onSubmit() {
    if (this.inviteForm.valid) {
      console.log('Form Submitted:', this.inviteForm.value);
      alert(`Invitation sent to ${this.inviteForm.get('email')?.value}`);
      this.dialogRef.close(this.inviteForm.value); // Pass data back to the parent
    }
  }
}