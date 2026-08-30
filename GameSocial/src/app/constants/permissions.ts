/** Corresponds to Domain.Constants.AppConstants.Permissions on the backend. */
export const PERMISSIONS = {
  GameManage: 'Game.Manage',
  SettingsManage: 'Settings.Manage',
  TranslationsManage: 'Translations.Manage',
  UsersManage: 'Users.Manage',
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

/** Every known backoffice permission, in the order shown in the sidebar/users table. */
export const PERMISSION_KEYS: PermissionKey[] = [
  PERMISSIONS.GameManage,
  PERMISSIONS.SettingsManage,
  PERMISSIONS.TranslationsManage,
  PERMISSIONS.UsersManage,
];

export interface BackofficeSection {
  permission: PermissionKey;
  path: string;
  label: string;
}

/** Maps each permission to the backoffice section it unlocks — drives the sidebar nav and guard fallbacks. */
export const BACKOFFICE_SECTIONS: BackofficeSection[] = [
  { permission: PERMISSIONS.GameManage, path: 'games', label: 'Games' },
  { permission: PERMISSIONS.TranslationsManage, path: 'languages', label: 'Languages & Translations' },
  { permission: PERMISSIONS.SettingsManage, path: 'settings', label: 'Settings' },
  { permission: PERMISSIONS.UsersManage, path: 'users', label: 'Users' },
];
