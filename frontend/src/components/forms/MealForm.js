// src/components/meals/MealForm.js
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/useAuth";
import DynamicBulkForm from "../forms/DynamicBulkForm";
import useOfflineTable from "../../hooks/useOfflineTable";  
import api from "../../api/client";

export default function MealForm() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { addRow } = useOfflineTable("meals");
  const [showSuccess, setShowSuccess] = useState(false);

  const handleSubmit = async (payload) => {
    try {
      // Use offline helper (will queue when offline). If online and the
      // backend returns a server id we rely on the list refresh to show it.
      const res = await addRow(payload);
      setShowSuccess(true);
      
      // Hide success message after 3 seconds
      setTimeout(() => {
        setShowSuccess(false);
      }, 3000);
    } catch (err) {
      console.error("Failed to create meal:", err);
      setShowSuccess(false);
      throw err;
    }
  };

  return (
    <div className="p-6">
      <h2 className="text-xl font-bold mb-4">Create Meal</h2>
      <DynamicBulkForm
        schema_name="Meal"
        onSubmit={handleSubmit}
      />
      {showSuccess && (
        <p className="mt-4 text-green-600">
          Meal created successfully! You can now distribute it to students.
        </p>
      )}
    </div>
  );
}
