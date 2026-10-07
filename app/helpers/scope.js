"use strict";
// Practice (tenant) filters for raw-SQL list queries. Platform admins and
// unauthenticated internal callers (no req.ctx) are not filtered.
//
//   const scope = practiceScope(req);
//   if (scope) { whereConditions.push(scope.condition("pt")); Object.assign(queryParams, scope.params); }

export function practiceScope(req) {
  const ctx = req?.ctx;
  if (!ctx || ctx.isPlatformAdmin) return null;
  return {
    params: { scopePracticeId: ctx.practiceId },
    condition: (alias) => `${alias}.practice_id = :scopePracticeId`,
  };
}

export default { practiceScope };
