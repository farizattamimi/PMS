import React from 'react'
import { Document, Page, Text, View, Image, StyleSheet, renderToBuffer } from '@react-pdf/renderer'

const styles = StyleSheet.create({
  page: { padding: 50, fontSize: 10, fontFamily: 'Helvetica', lineHeight: 1.5 },
  header: { marginBottom: 20, textAlign: 'center' },
  propertyName: { fontSize: 16, fontWeight: 'bold', marginBottom: 4 },
  address: { fontSize: 10, color: '#555555' },
  title: { fontSize: 14, fontWeight: 'bold', textAlign: 'center', marginBottom: 20, marginTop: 10 },
  sectionTitle: { fontSize: 11, fontWeight: 'bold', marginTop: 16, marginBottom: 6, borderBottom: '1 solid #cccccc', paddingBottom: 3 },
  row: { flexDirection: 'row', marginBottom: 3 },
  label: { width: 160, color: '#555555' },
  value: { flex: 1, fontWeight: 'bold' },
  clause: { marginBottom: 8, textAlign: 'justify' },
  clauseTitle: { fontWeight: 'bold', marginBottom: 2 },
  signatureSection: { marginTop: 30 },
  signatureBlock: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 20 },
  signatureBox: { width: 220 },
  signatureLabel: { fontSize: 9, color: '#555555', marginBottom: 4 },
  signatureLine: { borderBottom: '1 solid #000000', height: 50, marginBottom: 4 },
  signatureImage: { height: 50, marginBottom: 4, objectFit: 'contain' as any },
  signatureDate: { fontSize: 8, color: '#777777' },
  pending: { fontSize: 9, color: '#999999', fontStyle: 'italic', paddingTop: 15 },
  footer: { position: 'absolute', bottom: 30, left: 50, right: 50, textAlign: 'center', fontSize: 8, color: '#999999' },
})

interface LeaseData {
  id: string
  startDate: Date | string
  endDate: Date | string
  monthlyRent: number
  depositAmount: number
  status: string
  signedAt?: Date | string | null
  tenantSignature?: string | null
  managerSignature?: string | null
  tenant: {
    user: { name: string; email: string }
  }
  unit: {
    unitNumber: string
    bedrooms: number
    bathrooms: number
    sqFt: number | null
    property: {
      name: string
      address: string
      city: string
      state: string
      zip: string
      org?: { name: string } | null
    }
  }
}

function fmtDate(d: Date | string): string {
  return new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'long', day: 'numeric' }).format(new Date(d))
}

function fmtCurrency(n: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n)
}

function LeaseDocument({ lease }: { lease: LeaseData }) {
  const property = lease.unit.property
  const landlordName = property.org?.name || property.name

  return (
    <Document>
      <Page size="LETTER" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.propertyName}>{property.name}</Text>
          <Text style={styles.address}>
            {property.address}, {property.city}, {property.state} {property.zip}
          </Text>
        </View>

        <Text style={styles.title}>RESIDENTIAL LEASE AGREEMENT</Text>

        {/* Parties */}
        <Text style={styles.sectionTitle}>1. PARTIES</Text>
        <View style={styles.row}>
          <Text style={styles.label}>Landlord:</Text>
          <Text style={styles.value}>{landlordName}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Tenant:</Text>
          <Text style={styles.value}>{lease.tenant.user.name} ({lease.tenant.user.email})</Text>
        </View>

        {/* Premises */}
        <Text style={styles.sectionTitle}>2. PREMISES</Text>
        <View style={styles.row}>
          <Text style={styles.label}>Property:</Text>
          <Text style={styles.value}>{property.name}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Unit:</Text>
          <Text style={styles.value}>{lease.unit.unitNumber}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Bedrooms / Bathrooms:</Text>
          <Text style={styles.value}>{lease.unit.bedrooms} BR / {lease.unit.bathrooms} BA</Text>
        </View>
        {lease.unit.sqFt && (
          <View style={styles.row}>
            <Text style={styles.label}>Square Footage:</Text>
            <Text style={styles.value}>{lease.unit.sqFt.toLocaleString()} sq ft</Text>
          </View>
        )}

        {/* Lease Terms */}
        <Text style={styles.sectionTitle}>3. LEASE TERMS</Text>
        <View style={styles.row}>
          <Text style={styles.label}>Start Date:</Text>
          <Text style={styles.value}>{fmtDate(lease.startDate)}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>End Date:</Text>
          <Text style={styles.value}>{fmtDate(lease.endDate)}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Monthly Rent:</Text>
          <Text style={styles.value}>{fmtCurrency(lease.monthlyRent)}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Security Deposit:</Text>
          <Text style={styles.value}>{fmtCurrency(lease.depositAmount)}</Text>
        </View>

        {/* Standard Clauses */}
        <Text style={styles.sectionTitle}>4. TERMS AND CONDITIONS</Text>
        <View style={styles.clause}>
          <Text style={styles.clauseTitle}>Rent Payment.</Text>
          <Text>Rent is due on the first day of each month. Late payments may incur fees as outlined in the property&apos;s late fee policy. Payment shall be made via the property management portal or other method agreed upon by the parties.</Text>
        </View>
        <View style={styles.clause}>
          <Text style={styles.clauseTitle}>Security Deposit.</Text>
          <Text>The security deposit shall be held by the Landlord and returned within 30 days of lease termination, less any deductions for damages beyond normal wear and tear, unpaid rent, or other charges as permitted by applicable law.</Text>
        </View>
        <View style={styles.clause}>
          <Text style={styles.clauseTitle}>Maintenance and Repairs.</Text>
          <Text>Tenant shall maintain the premises in good condition and promptly report any maintenance issues through the property management portal. Landlord shall be responsible for structural repairs and building systems maintenance.</Text>
        </View>
        <View style={styles.clause}>
          <Text style={styles.clauseTitle}>Termination.</Text>
          <Text>Either party may terminate this lease at its expiration by providing written notice at least 30 days prior to the end date. Early termination by the Tenant may require forfeiture of the security deposit unless otherwise agreed in writing.</Text>
        </View>

        {/* Signatures */}
        <View style={styles.signatureSection}>
          <Text style={styles.sectionTitle}>5. SIGNATURES</Text>
          <View style={styles.signatureBlock}>
            <View style={styles.signatureBox}>
              <Text style={styles.signatureLabel}>TENANT</Text>
              {lease.tenantSignature ? (
                <Image src={lease.tenantSignature} style={styles.signatureImage} />
              ) : (
                <>
                  <View style={styles.signatureLine} />
                  <Text style={styles.pending}>Pending signature</Text>
                </>
              )}
              <Text>{lease.tenant.user.name}</Text>
              {lease.tenantSignature && <Text style={styles.signatureDate}>Signed electronically</Text>}
            </View>
            <View style={styles.signatureBox}>
              <Text style={styles.signatureLabel}>LANDLORD / MANAGER</Text>
              {lease.managerSignature ? (
                <Image src={lease.managerSignature} style={styles.signatureImage} />
              ) : (
                <>
                  <View style={styles.signatureLine} />
                  <Text style={styles.pending}>Pending signature</Text>
                </>
              )}
              <Text>{landlordName}</Text>
              {lease.managerSignature && <Text style={styles.signatureDate}>Signed electronically</Text>}
            </View>
          </View>
        </View>

        {/* Footer */}
        <Text style={styles.footer}>
          Lease ID: {lease.id} | Generated on {fmtDate(new Date())}
        </Text>
      </Page>
    </Document>
  )
}

export async function generateLeasePdf(lease: LeaseData): Promise<Buffer> {
  const buffer = await renderToBuffer(<LeaseDocument lease={lease} />)
  return Buffer.from(buffer)
}
