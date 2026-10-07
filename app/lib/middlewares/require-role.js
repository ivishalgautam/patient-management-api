"use strict";

// Route-level role gate. Must run after jwtVerify.verifyToken.
//   fastify.post("/import", { preHandler: requireRole("admin", "doctor") }, handler)
export const requireRole =
  (...allowedRoles) =>
  async (req, res) => {
    const role = req.user_data?.role;
    if (!role || !allowedRoles.includes(role)) {
      return res.code(403).send({
        status: false,
        message: "You don't have permission to perform this action.",
      });
    }
  };

export default requireRole;
