import React from "react";
import LoginForm from "../components/forms/LoginForm";
import useSeo from '../hooks/useSeo';

export default function Login() {
  useSeo({ title: 'Login - GCU Schools', description: 'Sign in to access the GCU Schools dashboard.' });
  return (
    <>
      <LoginForm />
    </>
  );
}
