import React from "react";
import LoginForm from "../components/forms/LoginForm";
import SeoHelmet from '../components/SeoHelmet';

export default function Login() {
  return (
    <>
      <SeoHelmet title="Login - GCU Schools" description="Sign in to access the GCU Schools dashboard." />
      <LoginForm />
    </>
  );
}
