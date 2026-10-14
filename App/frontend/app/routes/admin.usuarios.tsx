// Personal: orquestador. La interfaz vive en components/admin/users/; acá la lista, el filtro y la selección.
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
} from "~/state/api/users-api";
import { useAppSelector } from "~/state/hooks";
import { selectIsAdmin } from "~/state/slices/auth-slice";

import { PageHeader } from "~/components/admin/page-header";
import { SegmentedControl, ToolbarSearch, Workspace, WorkspaceToolbar } from "~/components/admin/workspace";
import { QueryState } from "~/components/ui/query-state";

import { UserCard } from "~/components/admin/users/user-card";
import { CreateUserDialog } from "~/components/admin/users/create-user-dialog";
import { DeleteUserDialog } from "~/components/admin/users/delete-user-dialog";
import { UserDetailDialog } from "~/components/admin/users/user-detail-dialog";
import { StaffDetailDialog } from "~/components/admin/users/staff-detail-dialog";
import { useUserActions } from "~/components/admin/users/use-user-actions";

export const meta: MetaFunction = () => {
  return [{ title: pageTitle('Personal', { admin: true }) }];
};

export default function AdminUsuarios() {
  const isAdmin = useAppSelector(selectIsAdmin);

  // Dos fuentes según el rol: /admin/users trae la cuenta bancaria y es solo admin; /staff/directory,
  // la misma gente sin datos de pago. `skip` evita la consulta que no corresponde.
  const adminQuery = useGetUsersQuery(undefined, { skip: !isAdmin });
  const directoryQuery = useGetStaffDirectoryQuery(undefined, { skip: isAdmin });
  const { data: users = [], isLoading, isError } = isAdmin ? adminQuery : directoryQuery;

  const reduceMotion = useReducedMotion();
  // Solo `changeRole`, para invitaciones pendientes; baja y restauración están en el detalle.
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
    <div className="flex flex-col gap-5">
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

        <div className="space-y-4">
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

      {/* Los diálogos de administración solo se montan para el admin. */}
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
export { AdminRouteError as ErrorBoundary } from '~/components/route-error';
