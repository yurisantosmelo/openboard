import { Navigate, type RouteObject } from 'react-router';
import {
  CHANGE_PASSWORD_PATH,
  ChangePasswordPage,
  LoginPage,
  RequireAuth,
  SIGN_IN_PATH,
} from '../features/auth';
import {
  ORGANIZATION_ROUTE,
  OrganizationPage,
  WORKSPACE_ROUTE,
  WorkspacePage,
} from '../features/organizations';
import { PROJECT_ROUTE, ProjectPage } from '../features/projects';
import { USERS_PATH, UsersPage } from '../features/users';
import { WORK_ITEM_ROUTE, WorkItemPage } from '../features/work-items';
import { AppLayout } from './AppLayout';
import { HomePage, OrganizationsPage } from './HomePage';

export const routes: RouteObject[] = [
  { path: SIGN_IN_PATH, element: <LoginPage /> },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { path: '/', element: <HomePage /> },
          { path: '/organizations', element: <OrganizationsPage /> },
          { path: USERS_PATH, element: <UsersPage /> },
          { path: CHANGE_PASSWORD_PATH, element: <ChangePasswordPage /> },
          { path: ORGANIZATION_ROUTE, element: <OrganizationPage /> },
          { path: WORKSPACE_ROUTE, element: <WorkspacePage /> },
          { path: PROJECT_ROUTE, element: <ProjectPage /> },
          { path: WORK_ITEM_ROUTE, element: <WorkItemPage /> },
        ],
      },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
];
