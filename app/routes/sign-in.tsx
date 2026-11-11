import { SignIn } from "@clerk/react-router";

export default function SignInPage() {
	return (
		<main className="flex min-h-screen items-center justify-center bg-[#f6f7fb] px-4 py-10">
			<div className="w-full max-w-md rounded-2xl border border-[#e7eaf0] bg-white p-6 shadow-sm sm:p-8">
				<div className="mb-6 text-center">
					<h1 className="text-xl font-semibold text-[#202b3c]">Agentic Inbox</h1>
					<p className="mt-2 text-sm text-[#667085]">Sign in with your authorized Google account.</p>
				</div>
				<SignIn routing="path" path="/sign-in" withSignUp fallbackRedirectUrl="/" signUpFallbackRedirectUrl="/" />
			</div>
		</main>
	);
}
