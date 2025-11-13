import React from "react";
import RegisterForm from "../components/forms/RegisterForm";
import SeoHelmet from '../components/SeoHelmet';

export default function Register() {
  return (
    <>
      <SeoHelmet title="Register - GCU Schools" description="Create an account to manage school data and attendance." />
      <RegisterForm />
    </>
  );
}
