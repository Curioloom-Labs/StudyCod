import { emailService } from "../emailService";

export class CertificateEmailService {
  async sendCertificateEmail(params: {
    to: string;
    participantName: string;
    contestName: string;
    pdfBuffer: Buffer;
    certificateId: string;
    verifyUrl: string;
  }): Promise<void> {
    await emailService.sendNotificationEmail({
      to: params.to,
      subject: "Your StudyCod contest certificate",
      title: "Your contest certificate",
      contentHtml: `<p>Hello, <b>${params.participantName}</b>!</p>
<p>Your certificate for contest <b>${params.contestName}</b> is attached as PDF.</p>
<p>Certificate ID: <b>${params.certificateId}</b></p>
<p>Verification link: <a href="${params.verifyUrl}">${params.verifyUrl}</a></p>`,
      text: `Your certificate for contest '${params.contestName}' is attached. Certificate ID: ${params.certificateId}. Verify: ${params.verifyUrl}`,
      attachments: [
        {
          filename: "certificate.pdf",
          content: params.pdfBuffer,
          contentType: "application/pdf",
        },
      ],
    });
  }
}
