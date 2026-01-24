<script setup lang="ts">
const mood = ref('test')
</script>

<template>
  <div class="p-10 space-y-4">
    <h1>Test Components</h1>
    <Button>Test Button</Button>
    <Label>Test Label</Label>
    <Input v-model="mood" />
    <Badge>Test Badge</Badge>
    <Card>
       <CardHeader>
         <CardTitle>Card Title</CardTitle>
         <CardDescription>Desc</CardDescription>
       </CardHeader>
       <CardContent>Content</CardContent>
    </Card>
    
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Head</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow>
          <TableCell>Cell</TableCell>
        </TableRow>
      </TableBody>
    </Table>
  </div>
</template>
