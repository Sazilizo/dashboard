import { createClient } from '@supabase/supabase-js'

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

async function getFormSchema(modelName) {
  const { data, error } = await supabase
    .from('form_schemas')
    .select('schema')
    .eq('model_name', modelName)
    .single()

  if (error) throw error
  return data.schema
}

// Example usage
const schema = await getFormSchema('Student')
