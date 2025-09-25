import { URLSearchParams } from "url";

export async function sendEmail({ id, type, email, expired, apiUrl, token }) {
  console.log(
    `[sendEmail] Sending email for invoice ID ${id} to ${email} (type: ${type}, expired: ${expired})`,
  );

  if (!id || !type || !email || expired === undefined) {
    throw new Error(
      `Missing required parameters: id=${id}, type=${type}, email=${email}, expired=${expired}`,
    );
  }

  if (!apiUrl || !token) {
    throw new Error("Missing apiUrl or token for sending email");
  }

  const endpoint = `${apiUrl}sales/documents/send-email`;
  const formData = new URLSearchParams();
  formData.append("id", id.toString());
  formData.append("type", type);
  formData.append("email", email);
  formData.append("expired", expired.toString());

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: token,
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: formData,
    });

    const responseText = await response.text();
    console.log(`[sendEmail] API Response for invoice ID ${id}:`, responseText);

    let result;
    try {
      result = JSON.parse(responseText || "{}");
    } catch {
      console.error(
        `[sendEmail] Failed to parse API response for invoice ID ${id}: ${responseText}`,
      );
      throw new Error(`Failed to parse API response: ${responseText}`);
    }

    if (!response.ok) {
      const errorMsg =
        result.message ||
        result.error ||
        (result.errors ? JSON.stringify(result.errors) : null) ||
        response.statusText ||
        "Unknown error";
      console.error(
        `[sendEmail] Failed to send email for invoice ID ${id}: ${errorMsg} (Status: ${response.status})`,
      );
      throw new Error(
        `Failed to send email: ${errorMsg} (Status: ${response.status})`,
      );
    }

    console.log(
      `[sendEmail] Email sent successfully for invoice ID ${id} to ${email}`,
    );
    return result;
  } catch (err) {
    console.error(
      `[sendEmail] Error sending email for invoice ID ${id}: ${err.message}`,
    );
    throw err;
  }
}
