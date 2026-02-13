"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import { createClient } from "@/lib/supabase/client"
import { Badge } from "@/components/ui/badge"
import { Users, Search, MoreVertical, Shield, ShieldAlert, UserCog } from "lucide-react"
import { Input } from "@/components/ui/input"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { BrandLoader } from "@/components/ui/brand-loader"


interface UserProfile {
    id: string
    full_name: string
    username: string
    email: string
    mobile: string
    role: 'admin' | 'manager' | 'staff'
    status: 'active' | 'inactive' | 'locked'
    last_login: string | null
}

export default function UsersPage() {
    const [users, setUsers] = useState<UserProfile[]>([])
    const [loading, setLoading] = useState(true)
    const [searchQuery, setSearchQuery] = useState("")
    const [error, setError] = useState("")
    const [success, setSuccess] = useState("")

    // Edit State
    const [editDialogOpen, setEditDialogOpen] = useState(false)
    const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null)
    const [formData, setFormData] = useState({ role: "", status: "" })
    const [saving, setSaving] = useState(false)

    const supabase = createClient()

    const fetchUsers = async () => {
        setLoading(true)
        setError("")

        const { data: { user: currentUser } } = await supabase.auth.getUser()
        if (!currentUser) return // Should redirect

        // Only allow view if admin or manager? 
        // RLS policies should handle this, but good to check UI side too ideally.
        // For now we trust RLS.

        const { data, error } = await supabase
            .from("users")
            .select("*")
            .order("full_name")

        if (error) {
            setError("Failed to load users")
            setUsers([])
        } else {
            setUsers(data as UserProfile[])
        }
        setLoading(false)
    }

    useEffect(() => {
        fetchUsers()
    }, [])

    const handleEditClick = (user: UserProfile) => {
        setSelectedUser(user)
        setFormData({ role: user.role, status: user.status })
        setEditDialogOpen(true)
    }

    const handleUpdateUser = async () => {
        if (!selectedUser) return
        setSaving(true)
        setError("")
        setSuccess("")

        try {
            const { error } = await supabase
                .from("users")
                .update({
                    role: formData.role,
                    status: formData.status
                })
                .eq("id", selectedUser.id)

            if (error) throw error

            setSuccess(`User ${selectedUser.full_name} updated successfully`)
            setEditDialogOpen(false)
            fetchUsers()
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to update user")
        } finally {
            setSaving(false)
        }
    }

    const filteredUsers = users.filter(user =>
        user.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        user.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
        user.username?.toLowerCase().includes(searchQuery.toLowerCase())
    )

    return (
        <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-2">
                <h1 className="text-3xl font-bold tracking-tight">User Management</h1>
                <p className="text-muted-foreground">
                    View and manage system users, roles, and access status.
                </p>
            </div>

            {error && (
                <Alert variant="destructive">
                    <ShieldAlert className="h-4 w-4" />
                    <AlertTitle>Error</AlertTitle>
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            )}

            {success && (
                <Alert className="border-primary bg-primary/5">
                    <UserCog className="h-4 w-4 text-primary" />
                    <AlertTitle>Success</AlertTitle>
                    <AlertDescription>{success}</AlertDescription>
                </Alert>
            )}

            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle>Users</CardTitle>
                            <CardDescription>Total {users.length} registered users</CardDescription>
                        </div>
                        {/* Add User Button Placeholder - Real implementation requires Auth Admin API */}
                        {/* <Button>Add User</Button> */}
                    </div>
                </CardHeader>
                <CardContent className="p-0 sm:p-6">
                    <div className="mb-4 px-4 sm:px-0 mt-4 sm:mt-0">
                        <div className="relative max-w-sm">
                            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            <Input
                                placeholder="Search users..."
                                className="pl-10"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>
                    </div>

                    <div className="overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="whitespace-nowrap">Name</TableHead>
                                    <TableHead className="whitespace-nowrap">Role</TableHead>
                                    <TableHead className="whitespace-nowrap">Status</TableHead>
                                    <TableHead className="whitespace-nowrap">Last Login</TableHead>
                                    <TableHead className="text-right whitespace-nowrap">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {loading ? (
                                    <TableRow>
                                        <TableCell colSpan={5} className="h-32">
                                            <div className="flex flex-col items-center justify-center gap-3">
                                                <div className="flex items-center justify-center py-20">
                                                    <BrandLoader size="lg" />
                                                </div>
                                                <span className="text-sm text-muted-foreground font-medium animate-pulse">Loading user directory...</span>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ) : filteredUsers.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={5} className="h-24 text-center">
                                            No users found.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    filteredUsers.map((user) => (
                                        <TableRow key={user.id}>
                                            <TableCell className="whitespace-nowrap">
                                                <div className="flex flex-col">
                                                    <span className="font-medium">{user.full_name}</span>
                                                    <span className="text-xs text-muted-foreground">{user.email}</span>
                                                </div>
                                            </TableCell>
                                            <TableCell className="whitespace-nowrap">
                                                <Badge variant={user.role === 'admin' ? 'default' : user.role === 'manager' ? 'secondary' : 'outline'}>
                                                    {user.role}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="whitespace-nowrap">
                                                <Badge variant={user.status === 'active' ? 'outline' : 'destructive'} className={user.status === 'active' ? 'text-green-600 border-green-600' : ''}>
                                                    {user.status}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="whitespace-nowrap">
                                                {user.last_login ? new Date(user.last_login).toLocaleDateString() : 'Never'}
                                            </TableCell>
                                            <TableCell className="text-right whitespace-nowrap">
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                        <Button variant="ghost" size="icon">
                                                            <MoreVertical className="h-4 w-4" />
                                                            <span className="sr-only">Actions</span>
                                                        </Button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end">
                                                        <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                                        <DropdownMenuItem onClick={() => handleEditClick(user)}>
                                                            <UserCog className="mr-2 h-4 w-4" />
                                                            Edit Role / Status
                                                        </DropdownMenuItem>
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>

            <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Edit User</DialogTitle>
                        <DialogDescription>Modify role and status for {selectedUser?.full_name}</DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="space-y-2">
                            <Label htmlFor="role">Role</Label>
                            <Select value={formData.role} onValueChange={(val) => setFormData({ ...formData, role: val })}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="staff">Staff</SelectItem>
                                    <SelectItem value="manager">Manager</SelectItem>
                                    <SelectItem value="admin">Admin</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="status">Status</Label>
                            <Select value={formData.status} onValueChange={(val) => setFormData({ ...formData, status: val })}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="active">Active</SelectItem>
                                    <SelectItem value="inactive">Inactive</SelectItem>
                                    <SelectItem value="locked">Locked</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setEditDialogOpen(false)}>Cancel</Button>
                        <Button onClick={handleUpdateUser} disabled={saving} className="min-w-[120px]">
                            {saving ? <BrandLoader size="xs" /> : "Update User"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
