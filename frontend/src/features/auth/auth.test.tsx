import { screen } from '@testing-library/react';
import { noContent, problem, stubApi, unauthenticated, userDto } from '../../test/fakeApi';
import { renderRoute } from '../../test/renderRoute';

afterEach(() => {
  vi.unstubAllGlobals();
});

/** A fake API where the session exists only after a successful sign-in, as on the real server. */
function stubSignIn(overrides: object = {}) {
  let signedIn = false;
  return stubApi({
    'GET /api/v1/users/me': () =>
      signedIn ? Response.json(userDto(overrides)) : unauthenticated(),
    'POST /api/v1/sessions': () => {
      signedIn = true;
      return Response.json(userDto(overrides), { status: 201 });
    },
  });
}

async function signInAs(user: ReturnType<typeof renderRoute>['user'], password = 'admin') {
  await user.type(await screen.findByLabelText('Username'), 'admin');
  await user.type(screen.getByLabelText('Password'), password);
  await user.click(screen.getByRole('button', { name: 'Sign in' }));
}

describe('sign-in', () => {
  it('opens with empty inputs and focuses Username', async () => {
    stubApi({ 'GET /api/v1/users/me': unauthenticated() });
    renderRoute('/login');

    const username = await screen.findByLabelText('Username');
    expect(username).toHaveFocus();
    expect(username).toHaveValue('');
    expect(screen.getByLabelText('Password')).toHaveValue('');
  });

  it('sends signed-out visitors to sign-in and back after signing in', async () => {
    stubSignIn();
    const { router, user } = renderRoute('/');

    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/login');

    await signInAs(user);

    expect(
      await screen.findByRole('heading', { name: 'Welcome, Administrator' }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/');
  });

  it('posts the typed credentials as JSON', async () => {
    const fetchMock = stubSignIn();
    const { user } = renderRoute('/login');

    await signInAs(user, 'secret');

    await screen.findByRole('heading', { name: 'Welcome, Administrator' });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/sessions',
      expect.objectContaining({ body: '{"username":"admin","password":"secret"}' }),
    );
  });

  it.each([
    [
      problem(401, 'invalid-credentials', 'Invalid username or password'),
      'Invalid username or password.',
    ],
    [
      problem(429, 'too-many-attempts', 'Too many failed sign-in attempts', {
        detail: 'Try again in a few minutes.',
      }),
      'Too many failed sign-in attempts. Try again in a few minutes.',
    ],
  ])('explains a failed sign-in', async (reply, message) => {
    stubApi({ 'GET /api/v1/users/me': unauthenticated(), 'POST /api/v1/sessions': reply });
    const { user } = renderRoute('/login');

    await signInAs(user, 'wrong');

    expect(await screen.findByRole('alert')).toHaveTextContent(message);
  });

  it('sends an already signed-in User home', async () => {
    stubApi({ 'GET /api/v1/users/me': Response.json(userDto()) });
    const { router } = renderRoute('/login');

    expect(
      await screen.findByRole('heading', { name: 'Welcome, Administrator' }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/');
  });

  it('reports an unreachable server', async () => {
    stubApi({});
    renderRoute('/');

    expect(await screen.findByRole('alert')).toHaveTextContent(/Could not reach the server/);
  });

  it('sends unknown paths home', async () => {
    stubApi({ 'GET /api/v1/users/me': Response.json(userDto()) });
    const { router } = renderRoute('/nowhere');

    await screen.findByRole('heading', { name: 'Welcome, Administrator' });
    expect(router.state.location.pathname).toBe('/');
  });
});

describe('Temporary Password', () => {
  function stubPendingUser(changeReply: () => Response) {
    let pending = true;
    return stubApi({
      'GET /api/v1/users/me': () => Response.json(userDto({ must_change_password: pending })),
      'PUT /api/v1/users/me/password': () => {
        const reply = changeReply();
        pending = reply.status !== 204;
        return reply;
      },
    });
  }

  async function fillPasswords(
    user: ReturnType<typeof renderRoute>['user'],
    next: string,
    confirmation = next,
  ) {
    await user.type(await screen.findByLabelText('Current password'), 'admin');
    await user.type(screen.getByLabelText('New password'), next);
    await user.type(screen.getByLabelText('Confirm new password'), confirmation);
    await user.click(screen.getByRole('button', { name: 'Change password' }));
  }

  it('must be changed before anything else', async () => {
    stubPendingUser(noContent);
    const { router, user } = renderRoute('/');

    expect(await screen.findByText(/signed in with a Temporary Password/)).toHaveAttribute(
      'role',
      'status',
    );
    expect(router.state.location.pathname).toBe('/change-password');

    await fillPasswords(user, 'a long and fine passphrase');

    expect(
      await screen.findByRole('heading', { name: 'Welcome, Administrator' }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/');
  });

  it('sends the User to change it right after signing in', async () => {
    stubSignIn({ must_change_password: true });
    const { router, user } = renderRoute('/login');

    await signInAs(user);

    expect(await screen.findByRole('heading', { name: 'Change password' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/change-password');
  });

  it('checks the confirmation before calling the API', async () => {
    const fetchMock = stubPendingUser(noContent);
    const { user } = renderRoute('/change-password');

    await fillPasswords(user, 'a long and fine passphrase', 'something else entirely');

    expect(await screen.findByText('The passwords do not match.')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalledWith('/api/v1/users/me/password', expect.anything());
  });

  it('shows the rule the new password broke next to the field', async () => {
    stubPendingUser(() =>
      problem(422, 'validation-error', 'Validation failed', {
        errors: [
          { field: 'new_password', code: 'weak', message: 'use at least 12 characters' },
          { field: 'other', code: 'x', message: 'ignored' },
        ],
      }),
    );
    const { user } = renderRoute('/change-password');

    await fillPasswords(user, 'short');

    expect(await screen.findByLabelText('New password')).toHaveAccessibleDescription(
      'use at least 12 characters',
    );
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('explains other failures in an alert', async () => {
    stubPendingUser(() => problem(500, 'internal-error', 'Internal server error'));
    const { user } = renderRoute('/change-password');

    await fillPasswords(user, 'a long and fine passphrase');

    expect(await screen.findByRole('alert')).toHaveTextContent('Internal server error.');
  });

  it('can also be changed voluntarily, without the Temporary Password notice', async () => {
    stubApi({ 'GET /api/v1/users/me': Response.json(userDto()) });
    renderRoute('/change-password');

    expect(await screen.findByRole('heading', { name: 'Change password' })).toBeInTheDocument();
    expect(screen.queryByText(/Temporary Password/)).not.toBeInTheDocument();
  });
});

describe('sign-out', () => {
  it('ends the session and returns to sign-in', async () => {
    let signedIn = true;
    stubApi({
      'GET /api/v1/users/me': () => (signedIn ? Response.json(userDto()) : unauthenticated()),
      'DELETE /api/v1/sessions/current': () => {
        signedIn = false;
        return noContent();
      },
    });
    const { router, user } = renderRoute('/');

    await user.click(await screen.findByRole('button', { name: 'Sign out' }));

    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/login');
  });
});
