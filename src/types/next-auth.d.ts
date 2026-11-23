import "next-auth";

type AppRole = "ADMIN" | "CLIENT" | "TEAM";

declare module "next-auth" {
  interface Session {
    user: {
      id?: string;
      role?: AppRole;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    uid?: string;
    role?: AppRole;
  }
}
