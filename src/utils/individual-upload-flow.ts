export interface ActiveUploadContext {
  companyId: string;
  generation: number;
}

export interface IndividualUploadFlow {
  begin: (companyId: string) => ActiveUploadContext;
  cancel: () => void;
  complete: (context: ActiveUploadContext) => void;
  getActive: () => ActiveUploadContext | null;
  isCurrent: (context: ActiveUploadContext, activeCompanyId: string | null) => boolean;
  createController: (context: ActiveUploadContext) => AbortController | null;
  releaseController: (controller: AbortController) => void;
}

/**
 * Identidad y cancelación de un solo flujo de upload.
 * La generación impide que una respuesta de una operación anterior vuelva a
 * considerarse vigente aunque abortar la request ya no tenga efecto.
 */
export function createIndividualUploadFlow(): IndividualUploadFlow {
  let generation = 0;
  let active: ActiveUploadContext | null = null;
  const controllers = new Set<AbortController>();

  const cancel = () => {
    generation += 1;
    active = null;
    controllers.forEach((controller) => controller.abort());
    controllers.clear();
  };

  const isSameContext = (context: ActiveUploadContext) =>
    active?.generation === context.generation && active.companyId === context.companyId;

  return {
    begin(companyId) {
      cancel();
      active = { companyId, generation };
      return active;
    },
    cancel,
    complete(context) {
      if (isSameContext(context)) active = null;
    },
    getActive() {
      return active;
    },
    isCurrent(context, activeCompanyId) {
      return Boolean(
        activeCompanyId &&
          activeCompanyId === context.companyId &&
          isSameContext(context),
      );
    },
    createController(context) {
      if (!isSameContext(context)) return null;
      const controller = new AbortController();
      controllers.add(controller);
      return controller;
    },
    releaseController(controller) {
      controllers.delete(controller);
    },
  };
}
