// src/components/meals/MealForm.js
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/useAuth";
import DynamicBulkForm from "../forms/DynamicBulkForm";
import api from "../../api/client";

export default function MealForm() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [mealId, setMealId] = useState(null);

  const presetFields = {
    // school_id: user?.profile?.school_id,
  };

  const handleSubmit = async (payload) => {
    try {
      // insert into meals table
      const { data, error } = await api
        .from("meals")
        .insert(payload)
        .select("id"); // return new meal id

      if (error) throw error;

      setMealId(data[0]?.id);
      console.log("Meal created with ID:", data[0]?.id);
    } catch (err) {
      console.error("Failed to create meal:", err);
      throw err;
    }
  };

  return (
    <div className="p-6">
      <h2 className="text-xl font-bold mb-4">Create Meal</h2>
      <DynamicBulkForm
        schema_name="Meal"
        presetFields={presetFields}
        onSubmit={handleSubmit}
        studentId={mealId} // optional for consistency with DynamicBulkForm
      />
      {mealId && (
        <p className="mt-4 text-green-600">
          Meal created! You can now distribute it to students.
        </p>
      )}
    </div>
  );
}
