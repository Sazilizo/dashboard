import api from "../client";

export const fetchCurrentUser = async () => {
  try {
    const {
      data: { user },
      error,
    } = await api.auth.getUser();

    if (error) throw error;
    return user;
  } catch (err) {
    throw err;
  }
};


