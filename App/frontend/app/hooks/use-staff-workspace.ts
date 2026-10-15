// Sesión del personal en la tienda: quién es, su rol legible y sus herramientas. Null para visitantes
// y clientes. La usan el avatar del escritorio y el grupo del personal del ☰.
import { useLocation } from '@remix-run/react';
import { toast } from 'sonner';

import { roleLabel } from '~/lib/roles';
import { signOut } from '~/lib/session.client';
import { staffActions } from '~/lib/store-navigation';
import { useAppDispatch, useAppSelector } from '~/state/hooks';
import { selectUser, selectUserPhoto, toggleEditMode } from '~/state/slices/auth-slice';

export function useStaffWorkspace() {
  const dispatch = useAppDispatch();
  const user = useAppSelector(selectUser);
  const photo = useAppSelector(selectUserPhoto);
  const { pathname, search } = useLocation();

  // La vista previa del editor también es la portada, pero adentro no se vuelve a abrir el editor.
  const onHome = pathname === '/' && !new URLSearchParams(search).has('landing-preview');
  const actions = staffActions(user?.role, { onHome });
  if (!user || actions.length === 0) return null;

  const firstName = user.name?.trim().split(/\s+/)[0] || user.email?.split('@')[0] || 'Personal';
  return {
    firstName,
    initial: firstName.charAt(0).toUpperCase(),
    photo,
    role: roleLabel(user.role),
    actions,
    openEditor: () => dispatch(toggleEditMode()),
    signOut: async () => {
      await signOut();
      toast.success('Sesión cerrada.');
    },
  };
}
