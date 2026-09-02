import {
  type FormEvent,
  useState,
} from 'react';
import {
  InvalidCredentialsError,
  LoginRateLimitedError,
} from './authApi';
import { useAuth } from './AuthContext';
import './auth.css';

export function LoginPage() {
  const { signIn } = useAuth();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] =
    useState(false);
  const [errorMessage, setErrorMessage] = useState<
    string | null
  >(null);

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (isSubmitting) {
      return;
    }

    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      await signIn({
        username,
        password,
      });
    } catch (error: unknown) {
      if (error instanceof InvalidCredentialsError) {
        setErrorMessage('Invalid username or password.');
      } else if (
        error instanceof LoginRateLimitedError
      ) {
        setErrorMessage(
          'Too many login attempts. Please try again later.',
        );
      } else {
        setErrorMessage(
          'Unable to sign in. Please try again.',
        );
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="auth-page">
      <section
        className="auth-card"
        aria-labelledby="login-title"
      >
        <p className="auth-eyebrow">Boutique Orders</p>

        <h1 id="login-title" className="auth-title">
          Sign in
        </h1>

        <p className="auth-description">
          Use your assigned account to access order
          operations.
        </p>

        <form
          className="auth-form"
          onSubmit={handleSubmit}
        >
          <label className="auth-field">
            <span>Username</span>

            <input
              name="username"
              type="text"
              autoComplete="username"
              value={username}
              disabled={isSubmitting}
              required
              autoFocus
              onChange={(event) => {
                setUsername(event.target.value);
              }}
            />
          </label>

          <label className="auth-field">
            <span>Password</span>

            <input
              name="password"
              type="password"
              autoComplete="current-password"
              value={password}
              disabled={isSubmitting}
              required
              onChange={(event) => {
                setPassword(event.target.value);
              }}
            />
          </label>

          {errorMessage && (
            <p className="auth-error" role="alert">
              {errorMessage}
            </p>
          )}

          <button
            className="auth-submit"
            type="submit"
            disabled={isSubmitting}
          >
            {isSubmitting
              ? 'Signing in...'
              : 'Sign in'}
          </button>
        </form>
      </section>
    </main>
  );
}