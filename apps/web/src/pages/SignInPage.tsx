import { SignIn } from '@clerk/clerk-react';

export function SignInPage() {
  return (
    <div className="center-page">
      <SignIn routing="path" path="/sign-in" signUpUrl="/sign-in" />
    </div>
  );
}
