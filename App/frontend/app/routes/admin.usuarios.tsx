// Vista de Personal: orquestador delgado. La UI vive en components/admin/users/
// (card, diálogos de crear/borrar/detalle, tab de rendimiento) y las acciones
// en useUserActions. Acá solo se resuelve la lista, el filtro activos/papelera
// y qué usuario está seleccionado.
import { HugeIcon } from "~/components/ui/icon";
import { UserSettings01Icon } from "@hugeicons/core-free-icons";
import { useState, useMemo } from "react";
import type { MetaFunction } from "@remix-run/node";
import { pageTitle } from '~/lib/brand';
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";

import {
  useGetStaffDirectoryQuery,
  useGetUsersQuery,
  type UserProfile,
} from "~/store/api/usersApi";
import { useAppSelector } from "~/store/hooks";
import { selectIsAdmin } from "~/store/slices/authSlice";

import { PageHeader } from "~/components/layout/PageHeader";
import { SegmentedControl, ToolbarSearch, Workspace, WorkspaceToolbar } from "~/components/admin/workspace";
import { QueryState } from "~/components/ui/QueryState";

import { UserCard } from "~/components/admin/users/UserCard";
import { CreateUserDialog } from "~/components/admin/users/CreateUserDialog";
import { DeleteUserDialog } from "~/components/admin/users/DeleteUserDialog";
import { UserDetailDialog } from "~/components/admin/users/UserDetailDialog";
import { StaffDetailDialog } from "~/components/admin/users/StaffDetailDialog";
import { useUserActions } from "~/components/admin/users/useUserActions";

export const meta: MetaFunction = () => {
  return [{ title: pageTitle('Personal', { admin: true }) }];
};

export default function AdminUsuarios() {
  const isAdmin = useAppSelector(selectIsAdmin);

  // Dos fuentes según el rol, no una con permisos aflojados. `/admin/users`
  // devuelve `select('*')` —incluida la cuenta bancaria de cada quien— y es
  // `requireAdmin`: el vendedor recibía 403 y veía la lista VACÍA, sin explicación.
  // `/staff/directory` trae la misma gente con una proyección sin datos de pago.
  // El `skip` evita que cada rol dispare la consulta que no le corresponde.
  const adminQuery = useGetUsersQuery(undefined, { skip: !isAdmin });
  const directoryQuery = useGetStaffDirectoryQuery(undefined, { skip: isAdmin });
  const { data: users = [], isLoading, isError } = isAdmin ? adminQuery : directoryQuery;

  const reduceMotion = useReducedMotion();
  // Solo `changeRole`, y solo para invitaciones pendientes: la baja y la
  // restauración las dispara «Administración» dentro de UserDetailDialog, que
  // llama a este mismo hook por su cuenta.
  const { changeRole } = useUserActions();

  const [userToDelete, setUserToDelete] = useState<UserProfile | null>(null);
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [viewedUser, setViewedUser] = useState<UserProfile | null>(null);
  const [detailTab, setDetailTab] = useState<"editar" | "rendimiento">("editar");
  const [currentTab, setCurrentTab] = useState<"activos" | "inactivos">("activos");
  const [search, setSearch] = useState("");

  function openDetail(user: UserProfile, tab: "editar" | "rendimiento") {
    setSelectedUser(user);
    setDetailTab(tab);
  }

  const activeUsers = useMemo(() => users.filter((u) => !u.deleted_at), [users]);
  const deletedUsers = useMemo(() => users.filter((u) => u.deleted_at), [users]);
  const displayedUsers = useMemo(() => {
    const list = currentTab === "activos" ? activeUsers : deletedUsers;
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter((u) =>
      [u.name, u.email].filter(Boolean).some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [currentTab, activeUsers, deletedUsers, search]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Análisis y sistema"
        title="Personal"
        className="mb-0"
        description={
          isAdmin
            ? "Administrá los roles y el acceso del equipo."
            : "Directorio del equipo. Para cambiar tus propios datos, entrá a «Mi perfil» desde tu avatar."
        }
        actions={isAdmin ? <CreateUserDialog /> : undefined}
      />

      <Workspace>
        <WorkspaceToolbar>
          <SegmentedControl
            label="Personal"
            value={currentTab}
            onChange={setCurrentTab}
            options={[
              { value: "activos", label: `Activos (${activeUsers.length})` },
              { value: "inactivos", label: `Dados de baja (${deletedUsers.length})` },
            ]}
          />
          <ToolbarSearch value={search} onChange={setSearch} placeholder="Buscar por nombre o correo" />
        </WorkspaceToolbar>

        <div className="space-y-4 p-4">
          <p className="text-xs text-muted-foreground">
            {currentTab === "activos"
              ? "Acceden al sistema con su cuenta de Microsoft."
              : isAdmin
                ? "Se eliminan definitivamente 30 días después de la baja."
                : "Compañeros que ya no tienen acceso al sistema."}
          </p>
          <QueryState
            loading={isLoading}
            error={isError}
            empty={displayedUsers.length === 0}
            shape="card"
            emptyFallback={
              <div className="p-12 text-center text-muted-foreground">
                <HugeIcon
                  icon={UserSettings01Icon}
                  size={32}
                  strokeWidth={2}
                  className="mx-auto mb-2 opacity-50"
                  aria-hidden
                />
                {search.trim()
                  ? "Nadie coincide con la búsqueda."
                  : currentTab === "activos"
                    ? "Todavía no hay personas registradas."
                    : "No hay nadie dado de baja."}
              </div>
            }
          >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <AnimatePresence mode="popLayout">
                {displayedUsers.map((user, i) => (
                  <motion.div
                    key={user.id}
                    layout={!reduceMotion}
                    initial={reduceMotion ? false : { opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.96 }}
                    transition={
                      reduceMotion
                        ? { duration: 0 }
                        : { duration: 0.25, ease: "easeOut", delay: i * 0.03 }
                    }
                  >
                    <UserCard
                      user={user}
                      isAdmin={isAdmin}
                      onEdit={() => openDetail(user, "editar")}
                      onPerformance={() => openDetail(user, "rendimiento")}
                      onDelete={() => setUserToDelete(user)}
                      onChangeRole={(role) => changeRole(user, role)}
                      onView={() => setViewedUser(user)}
                    />
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </QueryState>
        </div>
      </Workspace>

      {/* Los diálogos de administración solo se MONTAN para el admin. Renderizarlos
          siempre y confiar en que nadie los abra deja el formulario de edición y las
          mutations de rol/baja a un estado de distancia. */}
      {isAdmin ? (
        <>
          <DeleteUserDialog user={userToDelete} onClose={() => setUserToDelete(null)} />

          <UserDetailDialog
            user={selectedUser}
            initialTab={detailTab}
            onClose={() => setSelectedUser(null)}
            // Cierra la ficha ANTES de abrir la confirmación: dos diálogos
            // apilados dejan el de atrás inerte y no se entiende cuál pregunta.
            onRequestDelete={() => {
              setUserToDelete(selectedUser);
              setSelectedUser(null);
            }}
          />
        </>
      ) : (
        <StaffDetailDialog user={viewedUser} onClose={() => setViewedUser(null)} />
      )}
    </div>
  );
}

// Error dentro de la sección: se muestra en el área de contenido y la barra lateral sigue viva.
export { AdminRouteError as ErrorBoundary } from '~/components/layout/route-error';
