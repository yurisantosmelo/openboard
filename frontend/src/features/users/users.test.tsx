import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { problem, stubApi, userDto } from '../../test/fakeApi';
import { renderRoute } from '../../test/renderRoute';

function adminUserDto(overrides: object = {}) {
  return {
    id: 'u2',
    username: 'marina',
    name: 'Marina Silva',
    is_administrator: false,
    must_change_password: false,
    deactivated_at: null,
    created_at: '2026-11-20T12:00:00Z',
    ...overrides,
  };
}

function pageOf(items: object[], page = 1, totalPages = 1) {
  return Response.json({ items, page, total_pages: totalPages });
}

describe('User administration', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('redirects non-Administrators away from /users and hides the sidebar link', async () => {
    stubApi({
      'GET /api/v1/users/me': Response.json(
        userDto({ id: 'u2', username: 'marina', name: 'Marina', is_administrator: false }),
      ),
      'GET /api/v1/organizations?page=1&page_size=20': pageOf([]),
    });

    renderRoute('/users');
    expect(await screen.findByRole('heading', { name: 'Welcome, Marina' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Users' })).not.toBeInTheDocument();
  });

  it('lists Users, paginates, deactivates, reactivates and issues a Temporary Password', async () => {
    const user = userEvent.setup();
    let marinaDeactivated = false;
    let marinaMustChange = false;

    stubApi({
      'GET /api/v1/users/me': Response.json(userDto()),
      'GET /api/v1/users?page=1&page_size=20': () =>
        pageOf(
          [
            adminUserDto({
              id: 'u1',
              username: 'admin',
              name: 'Administrator',
              is_administrator: true,
            }),
            adminUserDto({
              must_change_password: marinaMustChange,
              deactivated_at: marinaDeactivated ? '2026-11-24T12:00:00Z' : null,
            }),
          ],
          1,
          2,
        ),
      'GET /api/v1/users?page=2&page_size=20': () =>
        pageOf([adminUserDto({ id: 'u3', username: 'pedro', name: 'Pedro Costa' })], 2, 2),
      'POST /api/v1/users/u2/temporary-password': () => {
        marinaMustChange = true;
        return Response.json(
          adminUserDto({ must_change_password: true, temporary_password: 'temp-password-xyz' }),
        );
      },
      'POST /api/v1/users/u2/deactivate': () => {
        marinaDeactivated = true;
        return Response.json(adminUserDto({ deactivated_at: '2026-11-24T12:00:00Z' }));
      },
      'POST /api/v1/users/u2/reactivate': () => {
        marinaDeactivated = false;
        return Response.json(adminUserDto({ deactivated_at: null }));
      },
    });

    renderRoute('/users');
    expect(await screen.findByRole('heading', { name: 'Users' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Users' })).toBeInTheDocument();
    expect(await screen.findByText('Marina Silva')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Deactivate Administrator' }),
    ).not.toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: 'Issue Temporary Password for Marina Silva' }),
    );
    expect(await screen.findByText('temp-password-xyz')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByText('temp-password-xyz')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Deactivate Marina Silva' }));
    expect(await screen.findByText('Deactivated')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Reactivate Marina Silva' }));
    expect(
      await screen.findByRole('button', { name: 'Deactivate Marina Silva' }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByText('Pedro Costa')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Previous' }));
    expect(await screen.findByText('Marina Silva')).toBeInTheDocument();
  });

  it('shows errors when loading or administering Users fails', async () => {
    const user = userEvent.setup();
    stubApi({
      'GET /api/v1/users/me': Response.json(userDto()),
      'GET /api/v1/users?page=1&page_size=20': pageOf([adminUserDto()]),
      'POST /api/v1/users/u2/deactivate': problem(
        409,
        'last-organization-owner',
        'User is the last Organization Owner of an Organization',
      ),
    });

    renderRoute('/users');
    await user.click(await screen.findByRole('button', { name: 'Deactivate Marina Silva' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'User is the last Organization Owner of an Organization',
    );
  });

  it('shows an error alert when the Users list fails to load', async () => {
    stubApi({
      'GET /api/v1/users/me': Response.json(userDto()),
      'GET /api/v1/users?page=1&page_size=20': problem(500, 'internal-error', 'Server failure'),
    });

    renderRoute('/users');
    expect(await screen.findByRole('alert')).toHaveTextContent('Server failure');
  });
});
