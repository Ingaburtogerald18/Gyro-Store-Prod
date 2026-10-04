import { HugeIcon } from "~/components/ui/icon";
import { Add01Icon, DashboardSquare01Icon, Delete02Icon, Edit02Icon, Package01Icon, Search01Icon, SquareIcon, Tag01Icon } from "@hugeicons/core-free-icons";
import { lazy, Suspense, useMemo, useState } from 'react';
import type { MetaFunction } from '@remix-run/node';
import { pageTitle } from '~/lib/brand';
import { 
  useGetAdminCatalogQuery, 
  useCreateAdminProductMutation, 
  useUpdateAdminProductMutation, 
  useDeleteAdminProductMutation,
  useReorderAdminCatalogMutation,
  useGetCategoriesQuery,
  useCreateCategoryMutation,
  useUpdateCategoryMutation,
  useDeleteCategoryMutation,
} from '~/store/api/catalogAdminApi';
import type { AdminProductInput, AdminProduct } from '@shared/schemas';
import { useAppSelector } from '~/store/hooks';
import { selectIsAdmin } from '~/store/slices/authSlice';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '~/components/ui/card';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import { PageHeader } from '~/components/layout/PageHeader';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '~/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '~/components/ui/dialog';
import { ConfirmDialog } from '~/components/ui/confirm-dialog';
import { QueryState } from '~/components/ui/QueryState';
import { Skeleton } from '~/components/ui/skeleton';
import { SkeletonCard } from '~/components/ui/skeletons';
import { BrandLoader } from '~/components/ui/module-loader';

import { SortableCatalogGrid } from '~/components/catalog/SortableCatalogGrid';
// Los dos más pesados del catálogo (27 KB y 21 KB) se descargaban al entrar,
// aunque el usuario solo viniera a mirar la grilla.
const ProductEditorDialog = lazy(() =>
  import('~/components/catalog/ProductEditorDialog').then((m) => ({ default: m.ProductEditorDialog })),
);
const TemplatesPanel = lazy(() =>
  import('~/components/catalog/TemplatesPanel').then((m) => ({ default: m.TemplatesPanel })),
);
const CombosPanel = lazy(() =>
  import('~/components/catalog/CombosPanel').then((m) => ({ default: m.CombosPanel })),
);
import { ToneDot } from '~/components/catalog/ToneDot';
import { toast } from 'sonner';

export const meta: MetaFunction = () => {
  return [{ title: pageTitle('Catálogo', { admin: true }) }];
};

export default function AdminCatalogo() {
  const { data: catalog = [], isLoading, isError, refetch } = useGetAdminCatalogQuery();
  const [createProduct, { isLoading: isCreating }] = useCreateAdminProductMutation();
  const [updateProduct, { isLoading: isUpdating }] = useUpdateAdminProductMutation();
  const [deleteProduct] = useDeleteAdminProductMutation();
  const [reorderCatalog] = useReorderAdminCatalogMutation();
  
  const { data: categories = [] } = useGetCategoriesQuery();
  const [createCategory] = useCreateCategoryMutation();
  const [updateCategory] = useUpdateCategoryMutation();
  const [deleteCategory] = useDeleteCategoryMutation();
  
  const [activeTab, setActiveTab] = useState("catalog");
  // El vendedor ve el catálogo en modo LECTURA: sin crear/editar/reordenar ni las
  // pestañas de gestión (categorías/plantillas/combos). El backend además le oculta
  // los precios internos.
  const isAdmin = useAppSelector(selectIsAdmin);

  const [search, setSearch] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<AdminProduct | null>(null);

  const [categoryFormData, setCategoryFormData] = useState({ name: '', slug: '', icon: '' });
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [isCategoryDialogOpen, setIsCategoryDialogOpen] = useState(false);

  // Estados para los modales de confirmación
  const [deleteProductId, setDeleteProductId] = useState<string | null>(null);
  const [deleteCategoryId, setDeleteCategoryId] = useState<string | null>(null);

  const handleOpenCreate = () => {
    setEditingProduct(null);
    setIsDialogOpen(true);
  };

  const handleOpenEdit = (product: AdminProduct) => {
    setEditingProduct(product);
    setIsDialogOpen(true);
  };

  const handleSave = async (input: AdminProductInput) => {
    try {
      if (editingProduct) {
        await updateProduct({ id: editingProduct.id, data: input }).unwrap();
        toast.success('Producto actualizado.');
      } else {
        await createProduct(input).unwrap();
        toast.success('Producto creado.');
      }
      setIsDialogOpen(false);
    } catch (error: any) {
      // Antes esto reportaba éxito ("Acción simulada") aunque el guardado
      // fallara, así que el admin creía haber guardado y no era cierto.
      toast.error(error?.data?.error || 'No se pudo guardar el producto.');
    }
  };

  const handleDelete = async (id: string) => {
    setDeleteProductId(id);
  };

  const confirmDeleteProduct = async () => {
    if (!deleteProductId) return;
    try {
      await deleteProduct(deleteProductId).unwrap();
      toast.success('Producto eliminado.');
    } catch (error: any) {
      toast.error(error?.data?.error || error?.message || 'No se pudo eliminar el producto. Verifica que no tenga pedidos asociados.');
    }
  };

  const handleReorder = async (newItems: AdminProduct[]) => {
    try {
      const reorderPayload = newItems.map((item, index) => ({
        id: item.id!,
        sortOrder: index,
      }));
      await reorderCatalog({ items: reorderPayload }).unwrap();
      toast.success('Orden actualizado.');
    } catch (error: any) {
      toast.error(error?.data?.error || 'No se pudo guardar el orden.');
    }
  };

  const handleSaveCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingCategoryId) {
        await updateCategory({ id: editingCategoryId, ...categoryFormData }).unwrap();
        toast.success('Categoría actualizada.');
      } else {
        await createCategory(categoryFormData).unwrap();
        toast.success('Categoría creada.');
      }
      setCategoryFormData({ name: '', slug: '', icon: '' });
      setEditingCategoryId(null);
      setIsCategoryDialogOpen(false);
    } catch (error) {
      toast.error('Error al guardar la categoría.');
    }
  };

  const handleDeleteCategory = async (id: string) => {
    setDeleteCategoryId(id);
  };

  const confirmDeleteCategory = async () => {
    if (!deleteCategoryId) return;
    try {
      await deleteCategory(deleteCategoryId).unwrap();
      toast.success('Categoría eliminada.');
    } catch (error) {
      toast.error('Error al eliminar.');
    }
  };

  const handleOpenCreateCategory = () => {
    setEditingCategoryId(null);
    setCategoryFormData({ name: '', slug: '', icon: '' });
    setIsCategoryDialogOpen(true);
  };

  // Filtro en memoria: el catálogo entero ya está en el cliente, así que buscar
  // en el servidor sería un viaje de red para recorrer una lista que ya tenemos.
  //
  // Se busca por nombre Y por descripción: con nombres cortos («ZSN Pro X»), lo
  // que uno recuerda a veces es una palabra de la ficha. Sin acentos y sin
  // distinguir mayúsculas, porque nadie escribe «Audífonos» con tilde al buscar.
  const normalize = (value: string) =>
    value
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '');

  const visibleCatalog = useMemo(() => {
    const term = normalize(search.trim());
    if (!term) return catalog;
    return catalog.filter((item) => {
      const haystack = normalize(`${item.name ?? ''} ${item.description ?? ''}`);
      // Cada palabra por separado: «kz pro» encuentra «KZ ZSN Pro X» aunque no
      // sea una subcadena literal.
      return term.split(/\s+/).every((word) => haystack.includes(word));
    });
  }, [catalog, search]);

  // El drag & drop reordena la lista COMPLETA. Con el buscador activo la grilla
  // muestra un subconjunto, así que arrastrar ahí guardaría un orden calculado
  // sobre una lista parcial y mandaría al fondo todo lo filtrado.
  const isFiltered = search.trim().length > 0;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Tienda"
        title="Gestión de Catálogo"
        description={
          isAdmin
            ? 'Arrastra productos para reordenar, edítalos, o administra las plantillas.'
            : 'Consultá los productos del catálogo y abrí sus fotos y videos.'
        }
        filters={
          isAdmin ? (
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full sm:w-auto">
              <TabsList>
                <TabsTrigger value="catalog"><HugeIcon icon={Package01Icon} size={16} strokeWidth={2} className="mr-2" /> Artículos</TabsTrigger>
                <TabsTrigger value="categories"><HugeIcon icon={Tag01Icon} size={16} strokeWidth={2} className="mr-2" /> Categorías</TabsTrigger>
                <TabsTrigger value="templates"><HugeIcon icon={DashboardSquare01Icon} size={16} strokeWidth={2} className="mr-2" /> Templates</TabsTrigger>
                <TabsTrigger value="combos"><HugeIcon icon={SquareIcon} size={16} strokeWidth={2} className="mr-2" /> Combos</TabsTrigger>
              </TabsList>
            </Tabs>
          ) : undefined
        }
      />

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsContent value="catalog" className="space-y-4 outline-none">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div className="relative flex-1 max-w-sm w-full">
              <HugeIcon icon={Search01Icon} size={16} strokeWidth={2} className="absolute left-2.5 top-2.5 text-muted-foreground" />
              <Input
                placeholder="Buscar productos..."
                className="pl-9 w-full"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Buscar productos del catálogo"
              />
            </div>

            {isAdmin && (
              <Button onClick={handleOpenCreate} className="font-bold h-10">
                <HugeIcon icon={Add01Icon} size={16} strokeWidth={2} className="mr-2" />
                Nuevo Producto
              </Button>
            )}
      </div>

      <QueryState
        loading={isLoading}
        error={isError}
        empty={visibleCatalog.length === 0}
        errorMessage="No se pudo cargar el catálogo."
        onRetry={refetch}
        loadingFallback={<BrandLoader text="Cargando catálogo..." />}
        emptyFallback={
          // Dos vacíos distintos: «no hay nada cargado» pide crear el primer
          // producto; «tu búsqueda no encontró nada» pide corregir el término.
          // Mostrar «Catálogo vacío» tras buscar «xyz» haría pensar que se
          // borró todo.
          <Card className="border-dashed bg-card">
            <CardContent className="flex flex-col items-center justify-center py-16">
              <HugeIcon icon={isFiltered ? Search01Icon : Tag01Icon} size={48} strokeWidth={2} className="text-muted-foreground mb-4" />
              {isFiltered ? (
                <>
                  <h3 className="text-lg font-medium text-foreground">Sin resultados</h3>
                  <p className="text-muted-foreground text-sm mt-1 mb-4 text-center max-w-sm">
                    Ningún producto coincide con «{search.trim()}».
                  </p>
                  <Button variant="outline" onClick={() => setSearch('')}>
                    Limpiar búsqueda
                  </Button>
                </>
              ) : (
                <>
                  <h3 className="text-lg font-medium text-foreground">Catálogo vacío</h3>
                  <p className="text-muted-foreground text-sm mt-1 mb-4 text-center max-w-sm">No hay productos registrados. Comienza agregando tu primer artículo.</p>
                  {isAdmin && (
                    <Button onClick={handleOpenCreate}>
                      <HugeIcon icon={Add01Icon} size={16} strokeWidth={2} className="mr-2" />
                      Agregar producto
                    </Button>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        }
      >
        <div className="space-y-3">
          {isFiltered && (
            <p className="text-xs text-muted-foreground">
              {visibleCatalog.length} de {catalog.length} productos · el orden no se puede cambiar
              mientras filtrás.
            </p>
          )}
          <SortableCatalogGrid
            items={visibleCatalog}
            // Arrastrar con el filtro puesto guardaría un orden calculado sobre
            // una lista parcial y mandaría al fondo todo lo que no se ve.
            readOnly={!isAdmin || isFiltered}
            onReorder={handleReorder}
            onEdit={handleOpenEdit}
            onDelete={handleDelete}
          />
        </div>
      </QueryState>
        </TabsContent>

        <TabsContent value="categories" className="space-y-6 outline-none">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-6">
              <div className="space-y-1">
                <CardTitle className="text-xl font-bold text-foreground">Administrar Categorías</CardTitle>
                <CardDescription className="text-muted-foreground">Creá o editá las categorías del catálogo público.</CardDescription>
              </div>
              <Button onClick={handleOpenCreateCategory}>
                <HugeIcon icon={Add01Icon} size={18} strokeWidth={2} className="mr-2" />
                Agregar Categoría
              </Button>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {categories.length === 0 ? (
                  <p className="text-muted-foreground text-center py-4">No hay categorías registradas.</p>
                ) : (
                  categories.map(c => (
                    <div key={c.id} className="flex items-center justify-between p-4 bg-card/50 border rounded-lg">
                      <div className="flex items-center gap-3">
                        {/* Acá es donde se aprende el color: la lista de
                            categorías es el único lugar que las muestra todas
                            juntas, así que el tono se fija por comparación. */}
                        <ToneDot toneKey={c.id} className="size-2.5" />
                        <div>
                          <h4 className="font-medium text-foreground">
                            {c.icon && <span className="mr-2 text-lg">{c.icon}</span>}
                            {c.name}
                          </h4>
                          <p className="text-sm text-muted-foreground">/{c.slug}</p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          onClick={() => { setEditingCategoryId(c.id); setCategoryFormData({ name: c.name, slug: c.slug, icon: c.icon ?? '' }); setIsCategoryDialogOpen(true); }}
                          aria-label={`Editar categoría ${c.name}`}
                        >
                          <HugeIcon icon={Edit02Icon} size={16} strokeWidth={2} className="text-muted-foreground" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="hover:bg-destructive/20 hover:text-destructive"
                          onClick={() => handleDeleteCategory(c.id)}
                          aria-label={`Eliminar categoría ${c.name}`}
                        >
                          <HugeIcon icon={Delete02Icon} size={16} strokeWidth={2} />
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="templates" className="space-y-4 outline-none">
          <Suspense fallback={<SkeletonCard lines={6} />}>
            <TemplatesPanel categories={categories} />
          </Suspense>
        </TabsContent>

      <TabsContent value="combos" className="space-y-4 outline-none">
        <Suspense fallback={<SkeletonCard lines={6} />}>
          <CombosPanel />
        </Suspense>
      </TabsContent>
      </Tabs>

      {/* Solo se monta cuando está abierto: `Suspense` sin nada que renderizar
          no descarga el chunk, así que entrar al catálogo no paga los 27 KB. */}
      {isDialogOpen && (
        <Suspense fallback={null}>
          <ProductEditorDialog
            open={isDialogOpen}
            onOpenChange={setIsDialogOpen}
            product={editingProduct}
            categories={categories}
            isSaving={isCreating || isUpdating}
            onSave={handleSave}
          />
        </Suspense>
      )}

      {/* Modal para editar/crear categorías */}
      <Dialog open={isCategoryDialogOpen} onOpenChange={setIsCategoryDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <form onSubmit={handleSaveCategory}>
            <DialogHeader>
              <DialogTitle>{editingCategoryId ? 'Editar Categoría' : 'Nueva Categoría'}</DialogTitle>
              <DialogDescription>
                {editingCategoryId ? 'Modificá los detalles de esta categoría.' : 'Ingresá los detalles para la nueva categoría.'}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="catName">Nombre</Label>
                <Input 
                  id="catName" 
                  value={categoryFormData.name}
                  onChange={e => setCategoryFormData({ ...categoryFormData, name: e.target.value })}
                  placeholder="Ej. Accesorios Gaming"
                  required
                  autoFocus
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="catSlug">Slug (URL)</Label>
                <Input 
                  id="catSlug" 
                  value={categoryFormData.slug}
                  onChange={e => setCategoryFormData({ ...categoryFormData, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') })}
                  placeholder="ej-accesorios-gaming"
                  required
                />
                <p className="text-[0.8rem] text-muted-foreground">
                  El identificador único en la URL. Solo letras, números y guiones.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="catIcon">Ícono (Emoji)</Label>
                <Input 
                  id="catIcon" 
                  value={categoryFormData.icon}
                  onChange={e => setCategoryFormData({ ...categoryFormData, icon: e.target.value })}
                  placeholder="Ej. 🎧"
                  maxLength={16}
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsCategoryDialogOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit">
                {editingCategoryId ? 'Guardar Cambios' : 'Crear Categoría'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteProductId}
        onOpenChange={(open) => !open && setDeleteProductId(null)}
        title="Eliminar producto"
        description="¿Seguro que deseas eliminar este producto por completo? Esta acción no se puede deshacer."
        onConfirm={confirmDeleteProduct}
      />

      <ConfirmDialog
        open={!!deleteCategoryId}
        onOpenChange={(open) => !open && setDeleteCategoryId(null)}
        title="Eliminar categoría"
        description="¿Seguro que deseas eliminar esta categoría? Cualquier producto asociado dejará de pertenecer a ella."
        onConfirm={confirmDeleteCategory}
      />
    </div>
  );
}

// Error dentro de la sección: se muestra en el área de contenido y la barra lateral sigue viva.
export { AdminRouteError as ErrorBoundary } from '~/components/layout/route-error';
