
async function fetchSingleEntity(id, setLoading, setError, api) {
      setLoading(true);
      setError(null);

      try {
        const { data, error } = await api
          .from("students")
          .select(`
            *,
            meals:meal_distributions(*),
            academic_sessions:academic_sessions(*),
            pe_sessions:pe_sessions(*),
            assessments(*),
            attendance:attendance_records(*),
            school:schools(*)
          `)
          .eq("id", id)
          .single();

        if (error) throw error;
        setStudent(data);
      } catch (err) {
        console.error(err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
}
export default fetchSingleEntity