export type AuthProvider = "credential" | "vercel" | "github";

export interface Session {
  created: number;
  authProvider: AuthProvider;
  hasVercelAccount: boolean;
  user: {
    id: string;
    username: string;
    email: string | undefined;
    avatar: string;
    name?: string;
  };
}

export interface SessionUserInfo {
  user: Session["user"] | undefined;
  authProvider?: AuthProvider;
  hasVercelAccount?: boolean;
  isAdmin?: boolean;
  isManagedTemplateTrialUser?: boolean;
  hasGitHub?: boolean;
  hasGitHubAccount?: boolean;
  hasGitHubInstallations?: boolean;
}
