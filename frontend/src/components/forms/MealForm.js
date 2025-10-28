// src/components/meals/MealForm.js
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/useAuth";
import { useForm } from "react-hook-form";
import useOfflineTable from "../../hooks/useOfflineTable";  
import api from "../../api/client";
import useToast from "../../hooks/useToast";
import ToastContainer from "../ToastContainer";

export default function MealForm() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { addRow } = useOfflineTable("meals");
  const [loading, setLoading] = useState(false);
  const { toasts, showToast, removeToast } = useToast();
  
  const { register, handleSubmit, reset, formState: { errors } } = useForm({
    defaultValues: {
      meal_name: "",
      meal_type: "",
      quantity: 0,
      distributed_at: new Date().toISOString().split('T')[0],
    }
  });

  const onSubmit = async (data) => {
    setLoading(true);
    try {
      const payload = {
        ...data,
        quantity: Number(data.quantity),
        school_id: user?.profile?.school_id,
      };
      
      await addRow(payload);
      showToast("Meal created successfully! You can now distribute it to students.", "success");
      reset();
    } catch (err) {
      console.error("Failed to create meal:", err);
      showToast("Failed to create meal. Please try again.", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6">
      <ToastContainer toasts={toasts} removeToast={removeToast} />
      <h2 className="text-xl font-bold mb-4">Create Meal</h2>
      
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="mb-3">
          <label className="block mb-1 font-semibold">
            Meal Name <span className="text-red-600 ml-1">*</span>
          </label>
          <input
            {...register("meal_name", { required: "Meal name is required" })}
            type="text"
            className="w-full p-2 border rounded"
            placeholder="e.g., Rice and Chicken"
          />
          {errors.meal_name && <p className="text-red-600 text-sm">{errors.meal_name.message}</p>}
        </div>

        <div className="mb-3">
          <label className="block mb-1 font-semibold">
            Meal Type <span className="text-red-600 ml-1">*</span>
          </label>
          <select
            {...register("meal_type", { required: "Meal type is required" })}
            className="w-full p-2 border rounded"
          >
            <option value="">Select Meal Type</option>
            <option value="breakfast">Breakfast</option>
            <option value="lunch">Lunch</option>
            <option value="snack">Snack</option>
            <option value="dinner">Dinner</option>
          </select>
          {errors.meal_type && <p className="text-red-600 text-sm">{errors.meal_type.message}</p>}
        </div>

        <div className="mb-3">
          <label className="block mb-1 font-semibold">
            Quantity <span className="text-red-600 ml-1">*</span>
          </label>
          <input
            {...register("quantity", { 
              required: "Quantity is required",
              min: { value: 1, message: "Quantity must be at least 1" }
            })}
            type="number"
            className="w-full p-2 border rounded"
            placeholder="Number of meals"
            min="1"
          />
          {errors.quantity && <p className="text-red-600 text-sm">{errors.quantity.message}</p>}
        </div>

        <div className="mb-3">
          <label className="block mb-1 font-semibold">
            Distribution Date <span className="text-red-600 ml-1">*</span>
          </label>
          <input
            {...register("distributed_at", { required: "Date is required" })}
            type="date"
            className="w-full p-2 border rounded"
          />
          {errors.distributed_at && <p className="text-red-600 text-sm">{errors.distributed_at.message}</p>}
        </div>

        <button
          type="submit"
          disabled={loading}
          className="px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-50"
        >
          {loading ? "Creating..." : "Create Meal"}
        </button>
      </form>
    </div>
  );
}
