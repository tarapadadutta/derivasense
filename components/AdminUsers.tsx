"use client";

import { useEffect, useState } from "react";

type AdminUser = {
  id: number;
  email: string;
  full_name: string | null;
  is_active: boolean;
  status: string;
  role: string;
  created_at: string;
};

export default function AdminUsers() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const apiBase =
    typeof window !== "undefined" &&
    (window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1")
      ? "http://127.0.0.1:8000"
      : "";

  const loadUsers = async () => {
    setLoading(true);
    setError("");

    try {
      const token =
        localStorage.getItem("derivasense_token");

      if (!token) {
        throw new Error("Authentication required.");
      }

      const response = await fetch(
        `${apiBase}/api/admin/users`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result?.detail ||
            "Unable to load users."
        );
      }

      setUsers(result);
    } catch (error) {
      console.error(
        "Failed to load admin users:",
        error
      );

      setError(
        error instanceof Error
          ? error.message
          : "Unable to load users."
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const updateUser = async (
    userId: number,
    action:
      | "approve"
      | "reject"
      | "suspend"
      | "reactivate"
  ) => {
    try {
      const token =
        localStorage.getItem("derivasense_token");

      if (!token) {
        throw new Error(
          "Authentication required."
        );
      }

      const response = await fetch(
        `${apiBase}/api/admin/users/${userId}/${action}`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result?.detail ||
            `Unable to ${action} user.`
        );
      }

      await loadUsers();
    } catch (error) {
      console.error(
        `Failed to ${action} user:`,
        error
      );

      setError(
        error instanceof Error
          ? error.message
          : `Unable to ${action} user.`
      );
    }
  };

  const deleteUser = async (
    userId: number
  ) => {
    const confirmed = window.confirm(
      "Are you sure you want to delete this user?"
    );

    if (!confirmed) {
      return;
    }

    try {
      const token =
        localStorage.getItem("derivasense_token");

      if (!token) {
        throw new Error(
          "Authentication required."
        );
      }

      const response = await fetch(
        `${apiBase}/api/admin/users/${userId}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result?.detail ||
            "Unable to delete user."
        );
      }

      await loadUsers();
    } catch (error) {
      console.error(
        "Failed to delete user:",
        error
      );

      setError(
        error instanceof Error
          ? error.message
          : "Unable to delete user."
      );
    }
  };

  if (loading) {
    return (
      <section className="page-workspace">
        <div className="card workspace-card">
          <div className="eyebrow">
            DERIVASENSE AI
          </div>

          <h1 className="page-title">
            User Management
          </h1>

          <p className="sub">
            Loading users...
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="page-workspace">
      <div className="card workspace-card">
        <div className="eyebrow">
          ADMINISTRATION
        </div>

        <h1 className="page-title">
          User Management
        </h1>

        <p className="sub">
          Manage DerivaSense user accounts.
        </p>

        {error && (
          <div
            style={{
              marginTop: 16,
              padding: 12,
              borderRadius: 8,
              border:
                "1px solid rgba(255, 80, 80, 0.4)",
            }}
          >
            {error}
          </div>
        )}

        <div
          style={{
            marginTop: 24,
            overflowX: "auto",
          }}
        >
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
            }}
          >
            <thead>
              <tr>
                <th style={{ padding: 10, textAlign: "left" }}>
                  ID
                </th>
                <th style={{ padding: 10, textAlign: "left" }}>
                  Name
                </th>
                <th style={{ padding: 10, textAlign: "left" }}>
                  Email
                </th>
                <th style={{ padding: 10, textAlign: "left" }}>
                  Status
                </th>
                <th style={{ padding: 10, textAlign: "left" }}>
                  Role
                </th>
                <th style={{ padding: 10, textAlign: "left" }}>
                  Actions
                </th>
              </tr>
            </thead>

            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td style={{ padding: 10 }}>
                    {user.id}
                  </td>

                  <td style={{ padding: 10 }}>
                    {user.full_name || "—"}
                  </td>

                  <td style={{ padding: 10 }}>
                    {user.email}
                  </td>

                  <td style={{ padding: 10 }}>
                    {user.status}
                  </td>

                  <td style={{ padding: 10 }}>
                    {user.role}
                  </td>

                  <td
                    style={{
                      padding: 10,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {user.status === "PENDING" && (
                      <>
                        <button
                          onClick={() =>
                            updateUser(
                              user.id,
                              "approve"
                            )
                          }
                          style={{
                            marginRight: 6,
                          }}
                        >
                          Approve
                        </button>

                        <button
                          onClick={() =>
                            updateUser(
                              user.id,
                              "reject"
                            )
                          }
                        >
                          Reject
                        </button>
                      </>
                    )}

                    {user.status === "APPROVED" &&
                      user.role !== "ADMIN" && (
                        <button
                          onClick={() =>
                            updateUser(
                              user.id,
                              "suspend"
                            )
                          }
                        >
                          Suspend
                        </button>
                      )}

                    {(user.status === "REJECTED" ||
                      user.status === "SUSPENDED") && (
                      <button
                        onClick={() =>
                          updateUser(
                            user.id,
                            "reactivate"
                          )
                        }
                      >
                        Reactivate
                      </button>
                    )}

                    {user.role !== "ADMIN" && (
                      <button
                        onClick={() =>
                          deleteUser(user.id)
                        }
                        style={{
                          marginLeft: 6,
                        }}
                      >
                        Delete
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}