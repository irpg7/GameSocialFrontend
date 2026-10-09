import { SquadRoleName } from '../../../../models/squad.model';

/** Turkish role labels — 07-squad-settings: Kurucu (fixed) / Yönetici / Üye. */
export const SQUAD_ROLE_LABELS: Record<SquadRoleName, string> = {
  Captain: 'Kurucu',
  Admin: 'Yönetici',
  Member: 'Üye',
};
