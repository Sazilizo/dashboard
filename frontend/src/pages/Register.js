import React from "react";
import RegisterForm from "../components/forms/RegisterForm";
import useSeo from '../hooks/useSeo';

export default function Register() {
  useSeo({ title: 'Register - GCU Schools', description: 'Create an account to manage school data and attendance.' });
  return (
    <>
      <RegisterForm />
    </>
  );
}
