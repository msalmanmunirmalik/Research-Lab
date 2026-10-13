// UI hints only. Notebooks, protocols, experiments, and evidence are authorized on the server.
export interface RolePermissions {
  canManageUsers: boolean;
  canManageLabs: boolean;
  canManageProtocols: boolean;
  canManageInventory: boolean;
  canManageInstruments: boolean;
  canAccessLabNotebook: boolean;
  canAccessDataResults: boolean;
  canAccessCalculators: boolean;
  canAccessResearchTools: boolean;
  canAccessPresentations: boolean;
  canAccessGlobalData: boolean;
  canAccessConferences: boolean;
  canAccessReferenceLibrary: boolean;
  canAccessDataAnalytics: boolean;
  canAccessMolecularBiology: boolean;
  canAccessBioinformatics: boolean;
}

// Role hierarchy (higher number = more permissions)
export const ROLE_HIERARCHY = {
  'student': 1,
  'researcher': 2,
  'co_supervisor': 3,
  'principal_researcher': 3,
  'admin': 4
} as const;

export type UserRole = keyof typeof ROLE_HIERARCHY;

// Check if user has minimum required role
export const hasMinimumRole = (userRole: string, requiredRole: string): boolean => {
  const userLevel = ROLE_HIERARCHY[userRole as UserRole] || 0;
  const requiredLevel = ROLE_HIERARCHY[requiredRole as UserRole] || 0;
  return userLevel >= requiredLevel;
};

// Check if user has exact role
export const hasExactRole = (userRole: string, requiredRole: string): boolean => {
  return userRole === requiredRole;
};

// Check if user has one of the allowed roles
export const hasAllowedRole = (userRole: string, allowedRoles: string[]): boolean => {
  return allowedRoles.includes(userRole);
};

// Get role permissions for a user
export const getRolePermissions = (role: string): RolePermissions => {
  const basePermissions: RolePermissions = {
    canManageUsers: false,
    canManageLabs: true, // Everyone can manage labs now
    canManageProtocols: true,
    canManageInventory: false,
    canManageInstruments: true,
    canAccessLabNotebook: true,
    canAccessDataResults: true,
    canAccessCalculators: true,
    canAccessResearchTools: true,
    canAccessPresentations: true,
    canAccessGlobalData: true,
    canAccessConferences: true,
    canAccessReferenceLibrary: true,
    canAccessDataAnalytics: true,
    canAccessMolecularBiology: true,
    canAccessBioinformatics: true,
  };

  switch (role) {
    case 'admin':
      return {
        ...basePermissions,
        canManageUsers: true,
        canManageInventory: true,
      };

    case 'principal_researcher':
      return {
        ...basePermissions,
        canManageInventory: true,
      };

    case 'researcher':
      return {
        ...basePermissions,
        canManageInventory: true,
      };

    case 'student':
      return {
        ...basePermissions,
        canManageProtocols: false, // Students can view but not create/edit
      };

    default:
      return basePermissions;
  }
};

// Route access control
export const ROUTE_ACCESS = {
  '/dashboard': { minRole: 'student' },
  '/lab-notebook': { minRole: 'student' },
  '/protocols': { minRole: 'student' },
  '/data-results': { minRole: 'student' },
  '/presentations': { minRole: 'student' },
  '/ai-presentations': { minRole: 'student' },
  '/writing-studio': { minRole: 'student' },
  '/data-sharing': { minRole: 'student' },
  '/conferences': { minRole: 'student' },
  '/data-analysis': { minRole: 'student' },
  '/data-analytics': { minRole: 'student' },
  '/lab-workspace': { minRole: 'student' },
  '/project-management': { minRole: 'student' },
} as const;

// Check if user can access a specific route
export const canAccessRoute = (userRole: string, route: string): boolean => {
  const routeConfig = ROUTE_ACCESS[route as keyof typeof ROUTE_ACCESS];
  if (!routeConfig) return false;

  // Check if routeConfig has exactRoles property
  if ('exactRoles' in routeConfig && Array.isArray(routeConfig.exactRoles)) {
    return hasAllowedRole(userRole, routeConfig.exactRoles);
  }

  // Check if routeConfig has minRole property
  if ('minRole' in routeConfig && typeof routeConfig.minRole === 'string') {
    return hasMinimumRole(userRole, routeConfig.minRole);
  }

  return true;
};

// Get user's display name
export const getUserDisplayName = (user: any): string => {
  if (!user) return 'Unknown User';
  
  if (user.role === 'admin') {
    return `${user.first_name} ${user.last_name} (Admin)`;
  }
  
  if (user.role === 'principal_researcher') {
    return `Dr. ${user.first_name} ${user.last_name} (PI)`;
  }
  
  if (user.role === 'researcher') {
    return `${user.first_name} ${user.last_name} (Researcher)`;
  }
  
  if (user.role === 'student') {
    return `${user.first_name} ${user.last_name} (Student)`;
  }
  
  return `${user.first_name} ${user.last_name}`;
};

// Get role display name
export const getRoleDisplayName = (role: string): string => {
  switch (role) {
    case 'admin':
      return 'System Administrator';
    case 'principal_researcher':
      return 'Principal Investigator';
    case 'researcher':
      return 'Research Scientist';
    case 'student':
      return 'Research Student';
    default:
      return 'Unknown Role';
  }
};
